use std::collections::HashMap;

use crate::observability::{AuditEvent, AuditLog, CorrelationContext, CorrelationId};
use crate::observability::logging::{log_audit, log_signer_action};

/// Signer proxy — intercepts signature requests, enforces policy, emits audit logs
pub struct SignerProxy {
    audit_log: AuditLog,
}

impl SignerProxy {
    pub fn new(audit_log: AuditLog) -> Self {
        Self { audit_log }
    }

    /// Sign a transaction with full audit trail
    pub async fn sign(
        &self,
        ctx: CorrelationContext,
        signer_id: &str,
        payload: &[u8],
        policy_check: impl FnOnce(&CorrelationContext, &str, &[u8]) -> Result<(), String>,
    ) -> Result<String, String> {
        let cid = ctx.id().clone();

        // Auth / policy check
        if let Err(e) = policy_check(&ctx, signer_id, payload) {
            log_audit(
                &self.audit_log,
                AuditEvent::AuthFailure {
                    correlation_id: cid.clone(),
                    reason: e.clone(),
                    requester: Some(signer_id.to_string()),
                },
            );
            return Err(e);
        }

        // Simulated signing — real impl calls Starknet signer
        let tx_hash = format!("0x{}", hex::encode(&sha256::sha256(payload)));

        log_signer_action(&self.audit_log, &ctx, signer_id, "sign", &format!("tx_hash={}", tx_hash));

        log_audit(
            &self.audit_log,
            AuditEvent::SignSuccess {
                correlation_id: cid.clone(),
                tx_hash: Some(tx_hash.clone()),
                signer_id: signer_id.to_string(),
            },
        );

        Ok(tx_hash)
    }

    /// Public accessor for audit log (used by tests and dashboard)
    pub fn audit_log(&self) -> &AuditLog {
        &self.audit_log
    }
}

fn sha256(data: &[u8]) -> [u8; 32] {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::observability::logging::build_incident_trace;

    #[tokio::test]
    async fn test_sign_correlated_audit() {
        let log = AuditLog::new();
        let proxy = SignerProxy::new(log.clone());
        let ctx = CorrelationContext::new(CorrelationId::new());
        let cid = ctx.id().clone();

        let result = proxy.sign(ctx, "signer-alpha", b"test-payload", |_ctx, _sid, _p| Ok(())).await;
        assert!(result.is_ok());

        let events = log.events_for_correlation(&cid);
        assert!(events.iter().any(|e| matches!(e, AuditEvent::SignSuccess { .. })));
    }

    #[tokio::test]
    async fn test_sign_auth_failure_logged() {
        let log = AuditLog::new();
        let proxy = SignerProxy::new(log.clone());
        let ctx = CorrelationContext::new(CorrelationId::new());
        let cid = ctx.id().clone();

        let result = proxy
            .sign(ctx, "signer-beta", b"payload", |_ctx, _sid, _p| Err("unauthorized".to_string()))
            .await;
        assert!(result.is_err());

        let events = log.events_for_correlation(&cid);
        assert!(events.iter().any(|e| matches!(e, AuditEvent::AuthFailure { .. })));
    }
}

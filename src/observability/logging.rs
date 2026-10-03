use tracing::{error, info, warn};

use crate::observability::{AuditEvent, AuditLog, CorrelationContext};

/// Initialize structured logging with JSON formatter (production) or console (dev)
pub fn init_logging(level: &str) {
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(level.parse().unwrap_or(tracing::Level::INFO))
        .with_ansi(false)
        .json()
        .finish();
    tracing::subscriber::set_global_default(subscriber).expect("failed to set tracing subscriber");
}

/// Log an MCP-layer request with full correlation context
pub fn log_mcp_request(
    audit_log: &AuditLog,
    ctx: &CorrelationContext,
    method: &str,
    endpoint: &str,
    payload_summary: &str,
) {
    info!(
        correlation_id = %ctx.id(),
        component = "mcp",
        method = method,
        endpoint = endpoint,
        payload_summary = payload_summary,
        "mcp_request_received"
    );
    audit_log.record(AuditEvent::Info {
        correlation_id: ctx.id().clone(),
        component: "mcp".to_string(),
        message: format!("request {} {}", method, endpoint),
    });
}

/// Log a signer-layer action with correlation context
pub fn log_signer_action(
    audit_log: &AuditLog,
    ctx: &CorrelationContext,
    signer_id: &str,
    action: &str,
    detail: &str,
) {
    info!(
        correlation_id = %ctx.id(),
        component = "signer",
        signer_id = signer_id,
        action = action,
        detail = detail,
        "signer_action"
    );
    audit_log.record(AuditEvent::Info {
        correlation_id: ctx.id().clone(),
        component: "signer".to_string(),
        message: format!("{}: {} - {}", signer_id, action, detail),
    });
}

/// General-purpose audit log emitter — records to both tracing and the in-memory audit log
pub fn log_audit(audit_log: &AuditLog, event: AuditEvent) {
    let cid = event.correlation_id();
    let evt_type = event.event_type();
    match &event {
        AuditEvent::AuthFailure { reason, .. } => {
            warn!(correlation_id = %cid, reason = reason, "audit_auth_failure");
        }
        AuditEvent::PolicyBlock {
            policy_rule, detail, ..
        } => {
            warn!(
                correlation_id = %cid,
                policy_rule = policy_rule,
                detail = detail,
                "audit_policy_block"
            );
        }
        AuditEvent::SignSuccess {
            tx_hash,
            signer_id,
            ..
        } => {
            info!(
                correlation_id = %cid,
                signer_id = signer_id,
                tx_hash = tx_hash.as_deref().unwrap_or("pending"),
                "audit_sign_success"
            );
        }
        AuditEvent::ChainRevert {
            tx_hash,
            revert_reason,
            ..
        } => {
            error!(
                correlation_id = %cid,
                tx_hash = tx_hash,
                revert_reason = revert_reason,
                "audit_chain_revert"
            );
        }
        AuditEvent::TxSubmitted {
            tx_hash,
            chain_id,
            ..
        } => {
            info!(
                correlation_id = %cid,
                tx_hash = tx_hash,
                chain_id = chain_id,
                "audit_tx_submitted"
            );
        }
        AuditEvent::Info { message, .. } => {
            info!(correlation_id = %cid, message = message, "audit_info");
        }
    }
    audit_log.record(event);
}

/// Build a human-readable incident reconstruction trace from a correlation ID
pub fn build_incident_trace(audit_log: &AuditLog, cid: &crate::observability::CorrelationId) -> String {
    let events = audit_log.events_for_correlation(cid);
    if events.is_empty() {
        return format!("No audit trail found for correlation_id={}", cid);
    }
    let mut lines = Vec::new();
    for event in events {
        lines.push(format!(
            "  [{}] type={}",
            chrono::Utc::now().format("%H:%M:%S%.3f"),
            event.event_type()
        ));
        match event {
            AuditEvent::AuthFailure {
                reason,
                requester,
                ..
            } => {
                lines.push(format!("    reason={}", reason));
                if let Some(r) = requester {
                    lines.push(format!("    requester={}", r));
                }
            }
            AuditEvent::PolicyBlock {
                policy_rule, detail, ..
            } => {
                lines.push(format!("    policy_rule={}", policy_rule));
                lines.push(format!("    detail={}", detail));
            }
            AuditEvent::SignSuccess {
                tx_hash,
                signer_id,
                ..
            } => {
                lines.push(format!("    signer={}", signer_id));
                if let Some(h) = tx_hash {
                    lines.push(format!("    tx_hash={}", h));
                }
            }
            AuditEvent::ChainRevert {
                tx_hash,
                revert_reason,
                ..
            } => {
                lines.push(format!("    tx_hash={}", tx_hash));
                lines.push(format!("    revert_reason={}", revert_reason));
            }
            AuditEvent::TxSubmitted {
                tx_hash,
                chain_id,
                ..
            } => {
                lines.push(format!("    tx_hash={}", tx_hash));
                lines.push(format!("    chain_id={}", chain_id));
            }
            AuditEvent::Info { message, .. } => {
                lines.push(format!("    {}", message));
            }
        }
    }
    lines.join("\n")
}

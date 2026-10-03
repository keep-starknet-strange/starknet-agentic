use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

/// Unique identifier that flows across MCP → signer → tx execution
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CorrelationId(pub String);

impl CorrelationId {
    pub fn new() -> Self {
        Self(Uuid::new_v4().to_string())
    }

    pub fn from_existing(id: &str) -> Self {
        Self(id.to_string())
    }
}

impl Default for CorrelationId {
    fn default() -> Self {
        Self::new()
    }
}

/// Audit event taxonomy — covers auth failure, policy block, sign success, chain revert
#[derive(Debug, Clone, PartialEq)]
pub enum AuditEvent {
    /// Auth failure: invalid credentials or unauthorized signer
    AuthFailure {
        correlation_id: CorrelationId,
        reason: String,
        requester: Option<String>,
    },
    /// Policy block: request rejected by policy engine
    PolicyBlock {
        correlation_id: CorrelationId,
        policy_rule: String,
        detail: String,
    },
    /// Sign success: signature produced
    SignSuccess {
        correlation_id: CorrelationId,
        tx_hash: Option<String>,
        signer_id: String,
    },
    /// Chain revert: transaction reverted on-chain
    ChainRevert {
        correlation_id: CorrelationId,
        tx_hash: String,
        revert_reason: String,
    },
    /// Tx submitted successfully
    TxSubmitted {
        correlation_id: CorrelationId,
        tx_hash: String,
        chain_id: String,
    },
    /// Generic info
    Info {
        correlation_id: CorrelationId,
        component: String,
        message: String,
    },
}

impl AuditEvent {
    pub fn correlation_id(&self) -> &CorrelationId {
        match self {
            AuditEvent::AuthFailure { correlation_id, .. }
            | AuditEvent::PolicyBlock { correlation_id, .. }
            | AuditEvent::SignSuccess { correlation_id, .. }
            | AuditEvent::ChainRevert { correlation_id, .. }
            | AuditEvent::TxSubmitted { correlation_id, .. }
            | AuditEvent::Info { correlation_id, .. } => correlation_id,
        }
    }

    pub fn event_type(&self) -> &str {
        match self {
            AuditEvent::AuthFailure { .. } => "auth_failure",
            AuditEvent::PolicyBlock { .. } => "policy_block",
            AuditEvent::SignSuccess { .. } => "sign_success",
            AuditEvent::ChainRevert { .. } => "chain_revert",
            AuditEvent::TxSubmitted { .. } => "tx_submitted",
            AuditEvent::Info { .. } => "info",
        }
    }
}

/// In-memory audit log store — persisted events can be exported via observability pipeline
#[derive(Debug, Default)]
pub struct AuditLog {
    events: Arc<Mutex<Vec<AuditEvent>>>,
}

impl AuditLog {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record(&self, event: AuditEvent) {
        let mut store = self.events.lock().unwrap();
        store.push(event);
    }

    pub fn events(&self) -> Vec<AuditEvent> {
        self.events.lock().unwrap().clone()
    }

    pub fn events_for_correlation(&self, cid: &CorrelationId) -> Vec<&AuditEvent> {
        self.events
            .lock()
            .unwrap()
            .iter()
            .filter(|e| e.correlation_id() == cid)
            .collect()
    }

    pub fn events_since(&self, offset: usize) -> Vec<AuditEvent> {
        let events = self.events.lock().unwrap();
        events[offset..].to_vec()
    }
}

/// Propagates correlation ID through the request pipeline (MCP → signer → execution)
#[derive(Debug, Default)]
pub struct CorrelationContext {
    id: CorrelationId,
    state: HashMap<String, String>,
}

impl CorrelationContext {
    pub fn new(id: CorrelationId) -> Self {
        Self {
            id,
            state: HashMap::new(),
        }
    }

    pub fn id(&self) -> &CorrelationId {
        &self.id
    }

    pub fn get(&self, key: &str) -> Option<&String> {
        self.state.get(key)
    }

    pub fn set(&mut self, key: String, value: String) {
        self.state.insert(key, value);
    }

    pub fn into_request_headers(self) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert("x-correlation-id".to_string(), self.id.0.clone());
        for (k, v) in self.state {
            headers.insert(format!("x-meta-{}", k), v);
        }
        headers
    }

    pub fn from_headers(headers: &HashMap<String, String>) -> Self {
        let id = headers
            .get("x-correlation-id")
            .map(CorrelationId::from_existing)
            .unwrap_or_default();
        let mut ctx = Self::new(id);
        for (k, v) in headers {
            if k.starts_with("x-meta-") {
                let clean_key = k["x-meta-".len()..].to_string();
                ctx.state.insert(clean_key, v.clone());
            }
        }
        ctx
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_correlation_id_generated() {
        let id = CorrelationId::new();
        assert!(!id.0.is_empty());
    }

    #[test]
    fn test_correlation_context_propagation() {
        let mut ctx = CorrelationContext::new(CorrelationId::new());
        ctx.set("signer_id".to_string(), "signer-1".to_string());
        let headers = ctx.into_request_headers();
        assert!(headers.contains_key("x-correlation-id"));
        assert!(headers.contains_key("x-meta-signer_id"));
    }

    #[test]
    fn test_audit_log_records_and_retrieves() {
        let log = AuditLog::new();
        let cid = CorrelationId::new();
        log.record(AuditEvent::SignSuccess {
            correlation_id: cid.clone(),
            tx_hash: None,
            signer_id: "s1".to_string(),
        });
        assert_eq!(log.events().len(), 1);
        assert_eq!(log.events_for_correlation(&cid).len(), 1);
    }
}

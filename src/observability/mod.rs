pub mod correlation;
pub mod logging;

pub use correlation::{AuditEvent, AuditLog, CorrelationContext, CorrelationId};
pub use logging::{init_logging, log_audit, log_mcp_request, log_signer_action};

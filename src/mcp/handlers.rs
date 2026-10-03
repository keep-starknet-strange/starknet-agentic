use axum::extract::State;
use axum::response::Json;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::observability::{AuditEvent, AuditLog, CorrelationContext, CorrelationId};
use crate::observability::logging::{log_audit, log_mcp_request};

use super::types::{McpRequest, McpResponse};

/// Handle an incoming MCP request — attach correlation ID and forward to pipeline
pub async fn handle_mcp_request(
    State(audit_log): State<AuditLog>,
    headers: HashMap<String, String>,
    Json(request): Json<McpRequest>,
) -> Json<McpResponse> {
    // Reuse incoming correlation ID or generate a new one
    let ctx = CorrelationContext::from_headers(&headers);
    let cid = ctx.id().clone();

    log_mcp_request(
        &audit_log,
        &ctx,
        request.method.as_str(),
        request.endpoint.as_str(),
        &request.payload_summary(),
    );

    // Forward to signer pipeline (simplified here — real impl calls signer module)
    let result = process_mcp_request(request, &audit_log, &ctx).await;

    let response = match result {
        Ok(resp) => {
            log_audit(
                &audit_log,
                AuditEvent::Info {
                    correlation_id: cid.clone(),
                    component: "mcp".to_string(),
                    message: format!("request processed successfully: {}", resp.result),
                },
            );
            resp
        }
        Err(e) => {
            log_audit(
                &audit_log,
                AuditEvent::AuthFailure {
                    correlation_id: cid.clone(),
                    reason: e.to_string(),
                    requester: None,
                },
            );
            McpResponse::error(cid.to_string(), &e.to_string())
        }
    };

    Json(response)
}

async fn process_mcp_request(
    request: McpRequest,
    _audit_log: &AuditLog,
    _ctx: &CorrelationContext,
) -> Result<McpResponse, String> {
    // Placeholder — real implementation delegates to signer and tx execution
    Ok(McpResponse::ok(
        _ctx.id().to_string(),
        "request_received",
    ))
}

#[derive(Debug, Deserialize)]
pub struct AuditTraceRequest {
    pub correlation_id: String,
}

#[derive(Debug, Serialize)]
pub struct AuditTraceResponse {
    pub correlation_id: String,
    pub trace: String,
}

/// Return the full audit trace for a given correlation ID (incident reconstruction)
pub async fn get_audit_trace(
    State(audit_log): State<AuditLog>,
    Json(req): Json<AuditTraceRequest>,
) -> Json<AuditTraceResponse> {
    let cid = CorrelationId::from_existing(&req.correlation_id);
    let trace = crate::observability::logging::build_incident_trace(&audit_log, &cid);
    Json(AuditTraceResponse {
        correlation_id: req.correlation_id,
        trace,
    })
}

use axum::{routing::get, Router};
use std::sync::Arc;

mod mcp;
mod observability;
mod signer;

use mcp::handlers::{get_audit_trace, handle_mcp_request};
use observability::{AuditLog, init_logging};
use signer::SignerProxy;

#[tokio::main]
async fn main() {
    init_logging("info");

    let audit_log = Arc::new(AuditLog::new());

    let app = Router::new()
        .route("/mcp/request", axum::routing::post(handle_mcp_request))
        .route("/audit/trace", axum::routing::post(get_audit_trace))
        .with_state(audit_log);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await
        .unwrap();
    println!("observability server listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}

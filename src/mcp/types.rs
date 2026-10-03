use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct McpRequest {
    pub method: String,
    pub endpoint: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct McpResponse {
    pub correlation_id: String,
    pub status: String,
    pub result: String,
    pub error: Option<String>,
}

impl McpRequest {
    pub fn payload_summary(&self) -> String {
        if let Some(obj) = self.payload.as_object() {
            obj.keys()
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        } else {
            "non-object".to_string()
        }
    }
}

impl McpResponse {
    pub fn ok(correlation_id: String, result: &str) -> Self {
        Self {
            correlation_id,
            status: "ok".to_string(),
            result: result.to_string(),
            error: None,
        }
    }

    pub fn error(correlation_id: String, error: &str) -> Self {
        Self {
            correlation_id,
            status: "error".to_string(),
            result: String::new(),
            error: Some(error.to_string()),
        }
    }
}

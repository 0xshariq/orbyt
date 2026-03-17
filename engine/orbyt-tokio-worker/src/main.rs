use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader};

#[derive(Debug, Deserialize)]
struct WorkerInput {
    #[serde(rename = "type")]
    message_type: String,
    job: Option<JobPayload>,
}

#[derive(Debug, Deserialize)]
struct JobPayload {
    id: String,
    #[serde(rename = "workflowId")]
    workflow_id: String,
    payload: Option<Value>,
    metadata: Option<Value>,
}

#[derive(Debug, Serialize)]
struct WorkerOutput<'a> {
    #[serde(rename = "type")]
    message_type: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    progress: Option<Value>,
}

async fn send_message<W: AsyncWriteExt + Unpin>(writer: &mut W, message: &WorkerOutput<'_>) -> io::Result<()> {
    let payload = serde_json::to_string(message)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    writer.write_all(payload.as_bytes()).await?;
    writer.write_all(b"\n").await?;
    writer.flush().await
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let stdout = io::stdout();

    let mut reader = BufReader::new(stdin).lines();
    let mut writer = io::BufWriter::new(stdout);

    // Signal readiness to Node scheduler.
    send_message(
        &mut writer,
        &WorkerOutput {
            message_type: "ready",
            result: None,
            error: None,
            progress: None,
        },
    )
    .await?;

    while let Some(line) = reader.next_line().await? {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parsed: Result<WorkerInput, _> = serde_json::from_str(trimmed);
        let message = match parsed {
            Ok(msg) => msg,
            Err(err) => {
                send_message(
                    &mut writer,
                    &WorkerOutput {
                        message_type: "failed",
                        result: None,
                        error: Some(format!("Invalid JSON message: {err}")),
                        progress: None,
                    },
                )
                .await?;
                continue;
            }
        };

        match message.message_type.as_str() {
            "ping" => {
                send_message(
                    &mut writer,
                    &WorkerOutput {
                        message_type: "ready",
                        result: None,
                        error: None,
                        progress: None,
                    },
                )
                .await?;
            }
            "shutdown" => {
                break;
            }
            "execute" => {
                let job = match message.job {
                    Some(job) => job,
                    None => {
                        send_message(
                            &mut writer,
                            &WorkerOutput {
                                message_type: "failed",
                                result: None,
                                error: Some("Invalid job payload: missing job".to_string()),
                                progress: None,
                            },
                        )
                        .await?;
                        continue;
                    }
                };

                send_message(
                    &mut writer,
                    &WorkerOutput {
                        message_type: "progress",
                        result: None,
                        error: None,
                        progress: Some(json!({
                            "stage": "started",
                            "jobId": job.id,
                            "workflowId": job.workflow_id,
                        })),
                    },
                )
                .await?;

                // Keep behavior aligned with current Node worker until scheduled
                // execution is fully implemented inside worker runtime.
                send_message(
                    &mut writer,
                    &WorkerOutput {
                        message_type: "completed",
                        result: Some(json!({
                            "jobId": job.id,
                            "workflowId": job.workflow_id,
                            "status": "skipped",
                            "message": "Scheduled execution not yet implemented",
                            "hasPayload": job.payload.is_some(),
                            "hasMetadata": job.metadata.is_some(),
                        })),
                        error: None,
                        progress: None,
                    },
                )
                .await?;
            }
            other => {
                send_message(
                    &mut writer,
                    &WorkerOutput {
                        message_type: "failed",
                        result: None,
                        error: Some(format!("Unsupported worker message type: {other}")),
                        progress: None,
                    },
                )
                .await?;
            }
        }
    }

    Ok(())
}

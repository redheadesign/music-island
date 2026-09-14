use std::{env, fs, path::PathBuf, time::Duration};

use chrono::DateTime;
use futures_util::StreamExt;
use reqwest::{redirect::Policy, StatusCode};
use serde_json::Value;

use super::model::{clamp_percent, ProbeData, ProbeError, UsageWindow};

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const MAX_CREDENTIAL_BYTES: u64 = 128 * 1024;
const MAX_RESPONSE_BYTES: usize = 256 * 1024;

pub(crate) async fn probe() -> Result<ProbeData, ProbeError> {
    let token = read_access_token()?;
    let client = reqwest::Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| ProbeError::Protocol)?;
    let response = client
        .get(USAGE_URL)
        .bearer_auth(token)
        .header("anthropic-beta", "oauth-2025-04-20")
        .send()
        .await
        .map_err(classify_request_error)?;

    match response.status() {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => return Err(ProbeError::NeedsAuth),
        StatusCode::TOO_MANY_REQUESTS => return Err(ProbeError::RateLimited),
        status if !status.is_success() => return Err(ProbeError::Protocol),
        _ => {}
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(ProbeError::Protocol);
    }

    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(classify_request_error)?;
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(ProbeError::Protocol);
        }
        bytes.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| ProbeError::Protocol)?;
    parse_usage(&value)
}

fn classify_request_error(error: reqwest::Error) -> ProbeError {
    if error.is_timeout() {
        ProbeError::Timeout
    } else if error.is_connect() || error.is_request() || error.is_body() {
        ProbeError::Offline
    } else {
        ProbeError::Protocol
    }
}

fn read_access_token() -> Result<String, ProbeError> {
    let profile = env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .ok_or(ProbeError::NotInstalled)?;
    let paths = [
        profile.join(".claude/.credentials.json"),
        profile.join(".claude/credentials.json"),
    ];
    for path in paths {
        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };
        if !metadata.is_file() || metadata.len() > MAX_CREDENTIAL_BYTES {
            continue;
        }
        let bytes = fs::read(path).map_err(|_| ProbeError::NeedsAuth)?;
        let value: Value = serde_json::from_slice(&bytes).map_err(|_| ProbeError::NeedsAuth)?;
        let oauth = value.get("claudeAiOauth").unwrap_or(&value);
        let Some(token) = oauth
            .get("accessToken")
            .or_else(|| oauth.get("access_token"))
            .and_then(Value::as_str)
        else {
            continue;
        };
        if token.is_empty() || token.len() > 16 * 1024 {
            continue;
        }
        if oauth
            .get("expiresAt")
            .or_else(|| oauth.get("expires_at"))
            .and_then(Value::as_i64)
            .is_some_and(|expires| expires <= chrono::Utc::now().timestamp_millis())
        {
            return Err(ProbeError::NeedsAuth);
        }
        return Ok(token.to_owned());
    }
    Err(ProbeError::NeedsAuth)
}

pub(crate) fn parse_usage(value: &Value) -> Result<ProbeData, ProbeError> {
    let mut windows = Vec::new();
    if let Some(limits) = value.get("limits").and_then(Value::as_array) {
        for limit in limits.iter().take(8) {
            let kind = limit.get("kind").and_then(Value::as_str).unwrap_or("limit");
            let (id, label, duration) = identify_window(kind);
            let used = limit
                .get("percent")
                .or_else(|| limit.get("utilization"))
                .and_then(Value::as_f64)
                .and_then(clamp_percent);
            if used.is_none() {
                continue;
            }
            windows.push(make_window(
                id,
                label,
                duration,
                used,
                limit.get("resets_at"),
            ));
        }
    }
    if windows.is_empty() {
        for (key, id, label, duration) in [
            ("five_hour", "primary", "5 h", Some(300)),
            ("seven_day", "secondary", "7 d", Some(10_080)),
        ] {
            let Some(limit) = value.get(key).filter(|entry| entry.is_object()) else {
                continue;
            };
            let used = limit
                .get("utilization")
                .or_else(|| limit.get("percent"))
                .and_then(Value::as_f64)
                .and_then(clamp_percent);
            if used.is_none() {
                continue;
            }
            windows.push(make_window(
                id,
                label,
                duration,
                used,
                limit.get("resets_at"),
            ));
        }
    }
    if windows.is_empty() {
        return Err(ProbeError::NoData);
    }
    windows.truncate(2);
    Ok(ProbeData {
        windows,
        plan: None,
    })
}

fn make_window(
    id: &str,
    label: &str,
    duration: Option<u64>,
    used: Option<f64>,
    reset: Option<&Value>,
) -> UsageWindow {
    UsageWindow {
        id: id.to_string(),
        label: label.to_string(),
        used_percent: used,
        remaining_percent: used.map(|value| 100.0 - value),
        window_duration_minutes: duration,
        resets_at: reset.and_then(parse_reset),
    }
}

fn identify_window(kind: &str) -> (&'static str, &'static str, Option<u64>) {
    match kind {
        "five_hour" | "session" => ("primary", "5 h", Some(300)),
        "seven_day" | "weekly" | "weekly_all" => ("secondary", "7 d", Some(10_080)),
        _ => ("limit", "Limit", None),
    }
}

fn parse_reset(value: &Value) -> Option<i64> {
    value.as_i64().or_else(|| {
        value
            .as_str()
            .and_then(|text| DateTime::parse_from_rfc3339(text).ok()?.timestamp().into())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_current_object_shape_and_preserves_unknown_reset() {
        let parsed = parse_usage(&json!({
            "five_hour": {"utilization": 12.5, "resets_at": null},
            "seven_day": {"utilization": 105, "resets_at": "2026-09-14T12:00:00Z"}
        }))
        .unwrap();
        assert_eq!(parsed.windows[0].remaining_percent, Some(87.5));
        assert_eq!(parsed.windows[0].resets_at, None);
        assert_eq!(parsed.windows[1].remaining_percent, Some(0.0));
        assert!(parsed.windows[1].resets_at.is_some());
    }

    #[test]
    fn null_utilization_does_not_become_zero() {
        assert!(matches!(
            parse_usage(&json!({"five_hour": {"utilization": null}})),
            Err(ProbeError::NoData)
        ));
    }
}

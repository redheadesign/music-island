use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum UsageProvider {
    Codex,
    Claude,
}

impl UsageProvider {
    pub(crate) fn index(self) -> usize {
        match self {
            Self::Codex => 0,
            Self::Claude => 1,
        }
    }

    pub(crate) fn source(self) -> &'static str {
        match self {
            Self::Codex => "codex-app-server",
            Self::Claude => "claude-oauth",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub id: String,
    pub label: String,
    pub used_percent: Option<f64>,
    pub remaining_percent: Option<f64>,
    pub window_duration_minutes: Option<u64>,
    pub resets_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageProviderSnapshot {
    pub provider: UsageProvider,
    pub source: &'static str,
    pub state: UsageConnectionState,
    pub windows: Vec<UsageWindow>,
    pub plan: Option<String>,
    pub fetched_at: Option<i64>,
    pub stale_since: Option<i64>,
    pub message_code: Option<UsageMessageCode>,
}

impl UsageProviderSnapshot {
    pub(crate) fn disabled(provider: UsageProvider) -> Self {
        Self {
            provider,
            source: provider.source(),
            state: UsageConnectionState::Disabled,
            windows: Vec::new(),
            plan: None,
            fetched_at: None,
            stale_since: None,
            message_code: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UsageConnectionState {
    Disabled,
    Connecting,
    Connected,
    Stale,
    NeedsAuth,
    Unavailable,
    Error,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UsageMessageCode {
    NotInstalled,
    NeedsAuth,
    Offline,
    Timeout,
    RateLimited,
    NoData,
    ProtocolError,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    pub codex: UsageProviderSnapshot,
    pub claude: UsageProviderSnapshot,
}

#[derive(Clone, Debug)]
pub(crate) struct ProbeData {
    pub windows: Vec<UsageWindow>,
    pub plan: Option<String>,
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum ProbeError {
    NotInstalled,
    NeedsAuth,
    Offline,
    Timeout,
    RateLimited,
    NoData,
    Protocol,
}

impl ProbeError {
    pub(crate) fn message_code(self) -> UsageMessageCode {
        match self {
            Self::NotInstalled => UsageMessageCode::NotInstalled,
            Self::NeedsAuth => UsageMessageCode::NeedsAuth,
            Self::Offline => UsageMessageCode::Offline,
            Self::Timeout => UsageMessageCode::Timeout,
            Self::RateLimited => UsageMessageCode::RateLimited,
            Self::NoData => UsageMessageCode::NoData,
            Self::Protocol => UsageMessageCode::ProtocolError,
        }
    }

    pub(crate) fn clears_previous(self) -> bool {
        matches!(self, Self::NotInstalled | Self::NeedsAuth | Self::NoData)
    }
}

pub(crate) fn clamp_percent(value: f64) -> Option<f64> {
    value.is_finite().then(|| value.clamp(0.0, 100.0))
}

pub(crate) fn window_label(duration_minutes: Option<u64>, fallback: &str) -> String {
    match duration_minutes {
        Some(300) => "5 h".to_string(),
        Some(1_440) => "24 h".to_string(),
        Some(10_080) => "7 d".to_string(),
        Some(43_200..=44_640) => "30 d".to_string(),
        Some(minutes) if minutes < 1_440 => format!("{} h", minutes.div_ceil(60)),
        Some(minutes) => format!("{} d", minutes.div_ceil(1_440)),
        None => fallback.to_string(),
    }
}

pub(crate) fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_is_clamped_and_nan_is_unknown() {
        assert_eq!(clamp_percent(-8.0), Some(0.0));
        assert_eq!(clamp_percent(108.0), Some(100.0));
        assert_eq!(clamp_percent(f64::NAN), None);
    }
}

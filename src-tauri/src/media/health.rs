use serde::{Deserialize, Serialize};
use std::sync::{OnceLock, RwLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SmtcHealth {
    Healthy,
    Degraded,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmtcHealthSnapshot {
    pub status: SmtcHealth,
    pub consecutive_failures: u32,
    pub last_probe_ms: u64,
    pub last_error: Option<String>,
    pub session_count: u32,
}

impl Default for SmtcHealthSnapshot {
    fn default() -> Self {
        Self {
            status: SmtcHealth::Healthy,
            consecutive_failures: 0,
            last_probe_ms: 0,
            last_error: None,
            session_count: 0,
        }
    }
}

fn state() -> &'static RwLock<SmtcHealthSnapshot> {
    static STATE: OnceLock<RwLock<SmtcHealthSnapshot>> = OnceLock::new();
    STATE.get_or_init(|| RwLock::new(SmtcHealthSnapshot::default()))
}

pub fn current() -> SmtcHealthSnapshot {
    state().read().expect("SMTC health lock poisoned").clone()
}

pub fn record_success(probe_ms: u64, session_count: u32) -> SmtcHealthSnapshot {
    let mut next = state().write().expect("SMTC health lock poisoned");
    next.status = if probe_ms > 1_500 {
        SmtcHealth::Degraded
    } else {
        SmtcHealth::Healthy
    };
    next.consecutive_failures = 0;
    next.last_probe_ms = probe_ms;
    next.last_error = None;
    next.session_count = session_count;
    next.clone()
}

pub fn record_failure(probe_ms: u64, error: impl Into<String>) -> SmtcHealthSnapshot {
    let mut next = state().write().expect("SMTC health lock poisoned");
    next.consecutive_failures = next.consecutive_failures.saturating_add(1);
    next.last_probe_ms = probe_ms;
    next.last_error = Some(error.into());
    next.status = if next.consecutive_failures >= 2 {
        SmtcHealth::Unavailable
    } else {
        SmtcHealth::Degraded
    };
    next.session_count = 0;
    next.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn becomes_unavailable_after_two_failures_and_recovers() {
        let _ = record_success(20, 1);
        assert_eq!(
            record_failure(3_000, "timeout").status,
            SmtcHealth::Degraded
        );
        assert_eq!(
            record_failure(3_000, "0x80010002").status,
            SmtcHealth::Unavailable
        );
        assert_eq!(record_success(40, 1).status, SmtcHealth::Healthy);
    }
}

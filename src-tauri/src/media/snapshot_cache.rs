use super::{MediaProvider, MediaSnapshot};

/// The watcher owns freshness; readers must supply the current selection generation.
#[derive(Default)]
pub(super) struct SnapshotCache {
    latest: Option<(u64, MediaSnapshot)>,
}

impl SnapshotCache {
    pub(super) fn get(&self, generation: u64, provider: MediaProvider) -> Option<MediaSnapshot> {
        self.latest
            .as_ref()
            .and_then(|(saved_generation, snapshot)| {
                (*saved_generation == generation && snapshot.provider == provider)
                    .then(|| snapshot.clone())
            })
    }

    pub(super) fn store(&mut self, generation: u64, snapshot: &MediaSnapshot) {
        self.latest = Some((generation, snapshot.clone()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::{health::SmtcHealth, snapshot_key, PlaybackStatus};

    fn playing(provider: MediaProvider) -> MediaSnapshot {
        let mut snapshot = MediaSnapshot::no_session_for(provider);
        snapshot.has_session = true;
        snapshot.title = Some("Current track".into());
        snapshot.playback_status = PlaybackStatus::Playing;
        snapshot.position_ms = Some(1_000);
        snapshot.can_play = true;
        snapshot.can_pause = true;
        snapshot
    }

    #[test]
    fn new_readers_get_complete_metadata_at_the_latest_timeline_position() {
        let mut cache = SnapshotCache::default();
        let first = playing(MediaProvider::Smtc);
        cache.store(7, &first);
        let mut advanced = first.clone();
        advanced.position_ms = Some(6_000);
        advanced.updated_at = "new timeline".into();
        assert_eq!(snapshot_key(&first), snapshot_key(&advanced));
        cache.store(7, &advanced);
        let reader = cache.get(7, MediaProvider::Smtc).unwrap();
        assert!(reader.has_session);
        assert_eq!(reader.title.as_deref(), Some("Current track"));
        assert_eq!(reader.position_ms, Some(6_000));
        assert_eq!(reader.updated_at, "new timeline");
    }

    #[test]
    fn provider_switches_and_preferred_source_changes_reject_old_entries() {
        let mut cache = SnapshotCache::default();
        cache.store(7, &playing(MediaProvider::Smtc));
        assert!(cache.get(7, MediaProvider::YandexDirect).is_none());
        assert!(cache.get(8, MediaProvider::Smtc).is_none());
        assert!(cache.get(9, MediaProvider::Smtc).is_none());
        cache.store(9, &playing(MediaProvider::Smtc));
        assert!(cache.get(9, MediaProvider::Smtc).is_some());
    }

    #[test]
    fn cleared_direct_session_replaces_the_last_good_session() {
        let mut cache = SnapshotCache::default();
        cache.store(4, &playing(MediaProvider::YandexDirect));
        let cleared = MediaSnapshot::no_session_for(MediaProvider::YandexDirect);
        cache.store(4, &cleared);
        let reader = cache.get(4, MediaProvider::YandexDirect).unwrap();
        assert!(!reader.has_session);
        assert!(reader.title.is_none());
        assert!(!reader.can_play && !reader.can_pause);
        assert_eq!(reader.provider, MediaProvider::YandexDirect);
    }

    #[test]
    fn health_changes_are_saved_even_when_event_metadata_is_unchanged() {
        let mut cache = SnapshotCache::default();
        let first = playing(MediaProvider::Smtc);
        cache.store(2, &first);
        let mut degraded = first.clone();
        degraded.smtc_health = SmtcHealth::Degraded;
        assert_eq!(snapshot_key(&first), snapshot_key(&degraded));
        cache.store(2, &degraded);
        assert_eq!(
            cache.get(2, MediaProvider::Smtc).unwrap().smtc_health,
            SmtcHealth::Degraded
        );
        let mut unavailable = MediaSnapshot::no_session_for(MediaProvider::Smtc);
        unavailable.smtc_health = SmtcHealth::Unavailable;
        cache.store(2, &unavailable);
        let reader = cache.get(2, MediaProvider::Smtc).unwrap();
        assert!(!reader.has_session);
        assert_eq!(reader.smtc_health, SmtcHealth::Unavailable);
    }
}

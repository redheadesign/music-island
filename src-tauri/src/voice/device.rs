use wasapi::*;

pub fn find_device(name: Option<&str>, input: bool) -> Result<Device, String> {
    let direction = if input {
        Direction::Capture
    } else {
        Direction::Render
    };
    let enumerator = DeviceEnumerator::new()
        .map_err(|e| format!("Failed to create device enumerator: {}", e))?;

    if let Some(target_name) = name {
        let collection = enumerator
            .get_device_collection(&direction)
            .map_err(|e| format!("Failed to get device collection: {}", e))?;
        collection
            .get_device_with_name(target_name)
            .map_err(|e| format!("Device '{}' not found: {}", target_name, e))
    } else {
        enumerator
            .get_default_device(&direction)
            .map_err(|e| format!("Failed to get default device: {}", e))
    }
}

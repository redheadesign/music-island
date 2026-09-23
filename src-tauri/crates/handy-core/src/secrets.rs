//! Windows user-bound encryption. Serialized settings never contain plaintext keys.
use base64::{engine::general_purpose::STANDARD, Engine};

pub fn protect(secret: &str) -> Result<String, String> {
    if secret.is_empty() {
        return Ok(String::new());
    }
    Ok(format!(
        "dpapi:v1:{}",
        STANDARD.encode(crypt(secret.as_bytes(), false)?)
    ))
}

pub fn unprotect(value: &str) -> Result<String, String> {
    if value.is_empty() {
        return Ok(String::new());
    }
    let encoded = value
        .strip_prefix("dpapi:v1:")
        .ok_or("Unprotected credentials are not imported")?;
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "Invalid protected credential")?;
    String::from_utf8(crypt(&bytes, true)?).map_err(|_| "Invalid credential encoding".into())
}

#[cfg(windows)]
fn crypt(bytes: &[u8], decrypt: bool) -> Result<Vec<u8>, String> {
    use windows::Win32::{
        Foundation::{LocalFree, HLOCAL},
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };
    let length = u32::try_from(bytes.len()).map_err(|_| "Credential is too large")?;
    let input = CRYPT_INTEGER_BLOB {
        cbData: length,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        if decrypt {
            CryptUnprotectData(
                &input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptProtectData(
                &input,
                windows::core::PCWSTR::null(),
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
        .map_err(|_| "Windows could not access the protected credential".to_string())?;
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        // Erase the temporary allocation before releasing it to Windows.
        for index in 0..output.cbData as usize {
            std::ptr::write_volatile(output.pbData.add(index), 0);
        }
        let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
        Ok(result)
    }
}

#[cfg(not(windows))]
fn crypt(_: &[u8], _: bool) -> Result<Vec<u8>, String> {
    Err("Protected credentials require Windows".into())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn secrets_round_trip_without_plaintext() {
        let encrypted = protect("test-credential").unwrap();
        assert!(!encrypted.contains("test-credential"));
        assert_eq!(unprotect(&encrypted).unwrap(), "test-credential");
        assert!(unprotect("plaintext").is_err());
        assert!(unprotect("dpapi:v1:invalid").is_err());
    }
}

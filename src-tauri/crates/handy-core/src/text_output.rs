/// A short take without speech can produce a period or other punctuation.
pub(crate) fn discard_punctuation_only(text: String) -> String {
    if text.chars().any(char::is_alphanumeric) {
        text
    } else {
        String::new()
    }
}

/// A blank optional AI rewrite must leave the recognition result available.
pub(crate) fn non_blank_rewrite(text: String) -> Option<String> {
    (!text.trim().is_empty()).then_some(text)
}

/// Remove one final sentence period, preserving internal punctuation, ellipses
/// and trailing whitespace. Runs after recognition and optional AI processing.
pub(crate) fn remove_trailing_period(text: &mut String, enabled: bool) {
    if !enabled {
        return;
    }
    let end = text.trim_end().len();
    if end > 0 && text[..end].ends_with('.') && !text[..end - 1].ends_with('.') {
        text.remove(end - 1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discards_only_recognition_without_letters_or_digits() {
        for text in ["", " . ", "?!", "…", "\u{2003}"] {
            assert_eq!(discard_punctuation_only(text.to_owned()), "");
        }
        for text in ["Да.", "你好。", "한글", "٢", ".5", "Wait…"] {
            assert_eq!(discard_punctuation_only(text.to_owned()), text);
        }
    }

    #[test]
    fn blank_rewrite_keeps_the_original_output_available() {
        assert_eq!(non_blank_rewrite("\t \u{00a0}\n".to_owned()), None);
        assert_eq!(
            non_blank_rewrite("Текст. ".to_owned()).as_deref(),
            Some("Текст. ")
        );
    }

    #[test]
    fn removes_only_the_final_period_after_processing() {
        for (input, expected) in [
            ("Привет.", "Привет"), ("Первое. Второе.", "Первое. Второе"),
            ("Hello. \n", "Hello \n"), ("3.14.", "3.14"),
            ("3.14", "3.14"), ("Подожди...", "Подожди..."),
            ("Подожди…", "Подожди…"), ("Да!", "Да!"), ("Да?", "Да?"),
            ("", ""), (" \n", " \n"), (".", ""),
        ] {
            let mut text = input.to_string();
            remove_trailing_period(&mut text, true);
            assert_eq!(text, expected);
        }
    }

    #[test]
    fn leaves_output_unchanged_when_disabled() {
        let mut text = "Оставить точку.".to_string();
        remove_trailing_period(&mut text, false);
        assert_eq!(text, "Оставить точку.");
    }
}

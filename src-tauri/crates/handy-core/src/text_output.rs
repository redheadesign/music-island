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

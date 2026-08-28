/**
 * Strip HTML tags and decode HTML entities from text (e.g., imported Google Calendar descriptions).
 * Converts <br>, </p>, </div> into line breaks and extracts pure plain text.
 */
export function stripHtmlTags(input: string | null | undefined): string {
  if (!input) return '';

  let text = input;

  // Replace common HTML block/line break elements with newlines
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');

  // Use DOMParser when available in browser to strip remaining tags and decode entities
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      text = doc.body.textContent || '';
    } catch {
      text = text.replace(/<[^>]+>/g, '');
    }
  } else {
    // Regex fallback
    text = text.replace(/<[^>]+>/g, '');
  }

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // Normalize excessive empty lines and spaces
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

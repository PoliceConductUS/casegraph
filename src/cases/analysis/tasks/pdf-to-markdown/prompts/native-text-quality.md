# Native Text Quality Check

This task first attempts native PDF text extraction.

Treat extracted text as usable only when it contains readable complaint body
text, not just court headers, page markers, empty strings, or bad encoding.

If native text is not usable, record the reason and continue to OCR.

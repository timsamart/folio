package io.github.timsamart.folio;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.util.Locale;

final class FileRules {
    static final int MAX_BYTES = 2 * 1024 * 1024;
    static String name(String candidate, String mime) throws IOException {
        String value = candidate == null ? "" : candidate.replaceAll("[\\\\/\\p{Cntrl}]", "_").trim();
        if (value.isEmpty()) {
            if ("text/markdown".equals(mime) || "text/x-markdown".equals(mime)) return "document.md";
            if ("text/plain".equals(mime)) return "document.txt";
            throw new IOException("This file has no Markdown filename. Rename it with .md and try again.");
        }
        if (!value.toLowerCase(Locale.ROOT).matches(".*\\.(md|markdown|mdown|txt)$"))
            throw new IOException("Choose a .md, .markdown, .mdown, or .txt file.");
        if (value.length() > 240) value = value.substring(value.length() - 240);
        return value;
    }
    static String read(InputStream stream) throws IOException {
        if (stream == null) throw new IOException("The file provider did not return a file.");
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192]; int count;
        while ((count = stream.read(buffer)) != -1) {
            if (bytes.size() + count > MAX_BYTES) throw new IOException("The 2 MB file limit was exceeded.");
            bytes.write(buffer, 0, count);
        }
        String text;
        try { text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString(); }
        catch (CharacterCodingException ex) { throw new IOException("Save this file as UTF-8 text, then open it again."); }
        if (text.startsWith("\uFEFF")) text = text.substring(1);
        if (text.indexOf(0) >= 0) throw new IOException("This looks like a binary file, not Markdown text.");
        if (text.trim().isEmpty()) throw new IOException("This file is empty.");
        return text;
    }
}

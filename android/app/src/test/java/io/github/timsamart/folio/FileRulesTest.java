package io.github.timsamart.folio;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

public class FileRulesTest {
    @Test public void namesUseExtensionEvenWhenMimeIsGeneric() throws Exception {
        assertEquals("NOTES.MD", FileRules.name("NOTES.MD", "application/octet-stream"));
        assertEquals("document.md", FileRules.name(null, "text/markdown"));
        assertThrows(IOException.class, () -> FileRules.name("photo.jpg", "application/octet-stream"));
        assertThrows(IOException.class, () -> FileRules.name(null, "application/octet-stream"));
    }
    @Test public void utf8AndBomAreAcceptedWithoutCorruption() throws Exception {
        String text = "# Ελληνικά\n\nGrüße 😀";
        assertEquals(text, FileRules.read(new ByteArrayInputStream(("\uFEFF"+text).getBytes(StandardCharsets.UTF_8))));
    }
    @Test public void binaryEmptyMalformedAndOversizedInputsAreRejected() {
        assertThrows(IOException.class, () -> FileRules.read(new ByteArrayInputStream(new byte[]{65,0,66})));
        assertThrows(IOException.class, () -> FileRules.read(new ByteArrayInputStream(new byte[]{(byte)0xC3,40})));
        assertThrows(IOException.class, () -> FileRules.read(new ByteArrayInputStream("  ".getBytes())));
        assertThrows(IOException.class, () -> FileRules.read(new ByteArrayInputStream(new byte[FileRules.MAX_BYTES+1])));
    }
}

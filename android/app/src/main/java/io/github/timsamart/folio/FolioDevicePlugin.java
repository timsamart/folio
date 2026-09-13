package io.github.timsamart.folio;

import android.app.Activity;
import android.content.*;
import android.database.Cursor;
import android.media.*;
import android.net.Uri;
import android.os.*;
import android.provider.OpenableColumns;
import android.speech.tts.*;
import android.util.AtomicFile;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

@CapacitorPlugin(name = "FolioDevice")
public class FolioDevicePlugin extends Plugin {
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private boolean ttsReady = false, foreground = true;
    private final List<PluginCall> waiting = new ArrayList<>();
    private String speakingId;
    private AudioManager audio;
    private AudioFocusRequest focus;
    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        if (change < 0) main.post(() -> interrupt("Audio was interrupted. Tap Play to resume."));
    };

    private File inbox() {
        File dir = new File(getContext().getFilesDir(), "incoming-markdown");
        if (!dir.isDirectory()) dir.mkdirs();
        return dir;
    }
    private File[] entries() {
        File[] found = inbox().listFiles((dir, name) -> name.endsWith(".json"));
        if (found == null) return new File[0];
        Arrays.sort(found, Comparator.comparingLong(File::lastModified));
        return found;
    }
    private void saveIncoming(JSObject data) throws Exception {
        String id = UUID.randomUUID().toString(); data.put("id", id);
        AtomicFile target = new AtomicFile(new File(inbox(), id + ".json"));
        FileOutputStream out = null;
        try {
            out = target.startWrite(); out.write(data.toString().getBytes(StandardCharsets.UTF_8)); target.finishWrite(out);
        } catch (Exception ex) { if (out != null) target.failWrite(out); throw ex; }
    }
    @Override protected void handleOnNewIntent(Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_VIEW.equals(action) && !Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
        // Clear the consumed Activity intent before recreation. Copies in app-private
        // storage are acknowledged by JS only after the library transaction commits.
        getActivity().setIntent(new Intent(getContext(), MainActivity.class));
        files.execute(() -> {
            try {
                LinkedHashSet<Uri> uris = new LinkedHashSet<>();
                if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) uris.add(intent.getData());
                if (Intent.ACTION_SEND.equals(action)) {
                    Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM); if (uri != null) uris.add(uri);
                }
                if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                    ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM); if (list != null) uris.addAll(list);
                }
                if (intent.getClipData() != null) for (int i = 0; i < Math.min(20, intent.getClipData().getItemCount()); i++) {
                    Uri uri = intent.getClipData().getItemAt(i).getUri(); if (uri != null) uris.add(uri);
                }
                if (uris.isEmpty()) throw new IOException("No file was attached. Use Open with on a Markdown file.");
                int count = 0;
                for (Uri uri : uris) {
                    if (++count > 20) { saveIncoming(new JSObject().put("error", "Only the first 20 files were received. Open the remaining files separately.")); break; }
                    long queued = 0; for (File f : entries()) queued += f.length();
                    if (entries().length >= 40 || queued > 20L * 1024 * 1024) throw new IOException("The incoming queue is full. Open Folio to save waiting files, then try again.");
                    JSObject file = new JSObject();
                    try {
                        if (!"content".equals(uri.getScheme())) throw new IOException("Choose this file through your Android file manager.");
                        String name = null;
                        ContentResolver resolver = getContext().getContentResolver();
                        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                            if (cursor != null && cursor.moveToFirst()) {
                                int ni = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME), si = cursor.getColumnIndex(OpenableColumns.SIZE);
                                if (ni >= 0) name = cursor.getString(ni);
                                if (si >= 0 && !cursor.isNull(si) && cursor.getLong(si) > FileRules.MAX_BYTES) throw new IOException("The 2 MB file limit was exceeded.");
                            }
                        }
                        name = FileRules.name(name, resolver.getType(uri));
                        file.put("name", name);
                        try (InputStream in = resolver.openInputStream(uri)) { file.put("content", FileRules.read(in)); }
                    } catch (Exception ex) { file.put("error", "Could not open file: " + ex.getMessage()); }
                    saveIncoming(file);
                }
            } catch (Exception ex) {
                try { saveIncoming(new JSObject().put("error", ex.getMessage())); } catch (Exception ignored) {
                    main.post(() -> android.widget.Toast.makeText(getContext(), "Not enough storage to receive this file. Keep the original and try again.", android.widget.Toast.LENGTH_LONG).show());
                }
            }
            main.post(() -> notifyListeners("incomingFiles", new JSObject(), true));
        });
    }
    private String readSaved(InputStream in) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192]; int count;
        while ((count = in.read(buffer)) != -1) {
            if (bytes.size() + count > 16 * 1024 * 1024) throw new IOException("Invalid saved incoming file");
            bytes.write(buffer, 0, count);
        }
        return bytes.toString(StandardCharsets.UTF_8.name());
    }
    @PluginMethod public void pendingFiles(PluginCall call) {
        files.execute(() -> {
            try {
                JSArray result = new JSArray();
                for (File file : entries()) {
                    try (InputStream in = new AtomicFile(file).openRead()) { result.put(new JSONObject(readSaved(in))); }
                }
                call.resolve(new JSObject().put("files", result));
            } catch (Exception ex) { call.reject("Incoming files are unavailable. Keep the originals and retry.", ex); }
        });
    }
    @PluginMethod public void ackFile(PluginCall call) {
        String id = call.getString("id", "");
        if (!id.matches("[0-9a-f-]{36}")) { call.reject("Invalid incoming file ID"); return; }
        files.execute(() -> { new AtomicFile(new File(inbox(), id + ".json")).delete(); call.resolve(); });
    }
    @PluginMethod public void exportFile(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.getBytes(StandardCharsets.UTF_8).length > 30 * 1024 * 1024) { call.reject("Choose an export smaller than 30 MB."); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType(call.getString("type", "text/plain").split(";")[0])
            .putExtra(Intent.EXTRA_TITLE, call.getString("name", "document.md").replaceAll("[\\\\/\\p{Cntrl}]", "_"));
        startActivityForResult(call, intent, "exportResult");
    }
    @ActivityCallback private void exportResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.resolve(new JSObject().put("saved", false)); return; }
        Uri uri = result.getData().getData();
        files.execute(() -> {
            try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new IOException("No output file");
                out.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
                call.resolve(new JSObject().put("saved", true));
            } catch (Exception ex) { call.reject("The export could not be saved.", ex); }
        });
    }
    static boolean offline(Voice voice) {
        return voice != null && !voice.isNetworkConnectionRequired()
            && (voice.getFeatures() == null || !voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED));
    }
    @PluginMethod public void voices(PluginCall call) {
        main.post(() -> {
            if (ttsReady) { resolveVoices(call); return; }
            waiting.add(call);
            if (tts != null) return;
            tts = new TextToSpeech(getContext(), status -> main.post(() -> {
                ttsReady = status == TextToSpeech.SUCCESS;
                if (ttsReady) {
                    tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        public void onStart(String id) {}
                        public void onDone(String id) { main.post(() -> finish(id, "done", "")); }
                        public void onError(String id) { main.post(() -> finish(id, "error", "The device voice could not speak. Check downloaded voice data.")); }
                        public void onError(String id, int code) { onError(id); }
                    });
                }
                for (PluginCall pending : waiting) { if (ttsReady) resolveVoices(pending); else pending.reject("Android speech is unavailable. Choose a text-to-speech engine in Settings."); }
                waiting.clear();
                if (!ttsReady) { tts.shutdown(); tts = null; }
            }));
        });
    }
    private void resolveVoices(PluginCall call) {
        JSArray result = new JSArray();
        Set<Voice> all = tts.getVoices();
        if (all != null) all.stream().filter(FolioDevicePlugin::offline)
            .sorted(Comparator.comparing((Voice v) -> v.getLocale().toLanguageTag()).thenComparing(Comparator.comparingInt(Voice::getQuality).reversed()).thenComparing(Voice::getName))
            .forEach(v -> result.put(new JSObject().put("id", v.getName()).put("name", v.getLocale().getDisplayName() + " · " + v.getName()).put("lang", v.getLocale().toLanguageTag())));
        call.resolve(new JSObject().put("voices", result));
    }
    private void finish(String id, String state, String message) {
        if (!Objects.equals(speakingId, id)) return;
        speakingId = null; abandonFocus();
        notifyListeners("speech", new JSObject().put("id", id).put("state", state).put("message", message), true);
    }
    private void interrupt(String message) {
        String id = speakingId;
        if (tts != null) tts.stop();
        if (id != null) finish(id, "interrupted", message);
        else abandonFocus();
    }
    private boolean requestFocus() {
        audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setOnAudioFocusChangeListener(focusListener, main).build();
            return audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
        return audio.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }
    private void abandonFocus() {
        if (audio == null) return;
        if (Build.VERSION.SDK_INT >= 26 && focus != null) audio.abandonAudioFocusRequest(focus);
        else audio.abandonAudioFocus(focusListener);
        focus = null;
    }
    @PluginMethod public void speak(PluginCall call) {
        main.post(() -> {
            String text = call.getString("text", ""), name = call.getString("voice", ""), id = call.getString("id", "");
            if (!foreground || !ttsReady || text.isEmpty() || text.length() > 1000 || id.isEmpty()) { call.reject("Open Folio and select an installed device voice first."); return; }
            Set<Voice> all = tts.getVoices();
            Voice voice = all == null ? null : all.stream().filter(v -> v.getName().equals(name) && offline(v)).findFirst().orElse(null);
            // Check before and after selection. Never fall back to an engine default.
            if (!offline(voice) || tts.setVoice(voice) != TextToSpeech.SUCCESS || !offline(tts.getVoice()) || !name.equals(tts.getVoice().getName())) {
                call.reject("That offline voice is no longer installed. Download voice data in Android Settings."); return;
            }
            interrupt("A new passage was selected.");
            if (!requestFocus()) { call.reject("Audio is in use. Try playing again when it is available."); return; }
            tts.setSpeechRate(Math.max(.75f, Math.min(2f, call.getFloat("rate", 1f))));
            Bundle params = new Bundle(); params.putString(TextToSpeech.Engine.KEY_FEATURE_EMBEDDED_SYNTHESIS, "true");
            speakingId = id;
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, id) != TextToSpeech.SUCCESS) {
                finish(id, "error", "The installed voice could not speak."); call.reject("The installed voice could not speak."); return;
            }
            call.resolve();
        });
    }
    @PluginMethod public void stop(PluginCall call) { main.post(() -> { interrupt("Playback paused."); call.resolve(); }); }
    @PluginMethod public void voiceSettings(PluginCall call) {
        main.post(() -> {
            try { getActivity().startActivity(new Intent("com.android.settings.TTS_SETTINGS")); call.resolve(); }
            catch (Exception ex) {
                try { getActivity().startActivity(new Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS)); call.resolve(); }
                catch (Exception fallback) { call.reject("Open Android Settings and search for Text-to-speech."); }
            }
        });
    }
    @Override protected void handleOnPause() { foreground = false; interrupt("Playback paused when you left Folio."); }
    @Override protected void handleOnResume() { foreground = true; }
    @Override protected void handleOnDestroy() {
        interrupt("Reader closed.");
        if (tts != null) { tts.shutdown(); tts = null; }
        files.shutdown();
    }
}

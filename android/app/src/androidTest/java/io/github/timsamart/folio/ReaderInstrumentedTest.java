package io.github.timsamart.folio;

import android.content.*;
import android.net.Uri;
import android.speech.tts.*;
import androidx.core.content.FileProvider;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

@RunWith(AndroidJUnit4.class)
public class ReaderInstrumentedTest {
    @Test public void offlineVoiceGateRejectsNetworkAndMissingData() {
        assertTrue(FolioDevicePlugin.offline(new Voice("local",Locale.ENGLISH,300,200,false,Collections.emptySet())));
        assertFalse(FolioDevicePlugin.offline(new Voice("network",Locale.ENGLISH,500,100,true,Collections.emptySet())));
        assertFalse(FolioDevicePlugin.offline(new Voice("missing",Locale.ENGLISH,500,100,false,Set.of(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))));
        assertFalse(FolioDevicePlugin.offline(null));
    }
    private Uri fixture(Context context, String name, String text) throws Exception {
        File dir = new File(context.getCacheDir(), "file-tests"); dir.mkdirs();
        File file = new File(dir,name);
        try (OutputStream out = new FileOutputStream(file)) { out.write(text.getBytes(StandardCharsets.UTF_8)); }
        return FileProvider.getUriForFile(context, context.getPackageName()+".fileprovider", file);
    }
    private String js(MainActivity activity, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1); String[] value = new String[1];
        activity.runOnUiThread(() -> activity.getBridge().getWebView().evaluateJavascript(script, result -> { value[0]=result; done.countDown(); }));
        assertTrue("WebView callback", done.await(10,TimeUnit.SECONDS)); return value[0];
    }
    private void until(MainActivity activity, String script) throws Exception {
        long end = System.currentTimeMillis()+30000;
        while (System.currentTimeMillis()<end) { if ("true".equals(js(activity,script))) return; Thread.sleep(120); }
        fail("Timed out: "+script+"; page="+js(activity,"document.body.innerText.slice(-1600)"));
    }
    @Test public void nativeOpenWithAndWarmSharePersistRenderedFiles() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        Uri first = fixture(context,"FOLIO-TEST.MD","# Native file test\n\nHello from Android.\n\n## Formula\n\n$x^2$\n\n```js\nconst works = true;\n```\n\n```mermaid\ngraph LR\n A-->B\n```");
        Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(first,"application/octet-stream").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_ACTIVITY_NEW_TASK);
        assertTrue("Resolver includes Folio for generic Markdown MIME", context.getPackageManager().queryIntentActivities(view,0).stream().anyMatch(r -> r.activityInfo.packageName.equals(context.getPackageName())));
        view.setPackage(context.getPackageName());
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(view);
        until(activity,"document.querySelector('#reading-content h1')?.textContent === 'Native file test'");
        until(activity,"!!document.querySelector('.diagram-canvas svg') && !!document.querySelector('.katex') && !!document.querySelector('.hljs-keyword')");
        assertEquals("true",js(activity,"location.origin === 'https://localhost' && !navigator.serviceWorker.controller"));
        assertEquals("true",js(activity,"document.documentElement.scrollWidth <= innerWidth"));
        Uri second = fixture(context,"warm.markdown","# Warm share\n\nA second file.");
        Intent share = new Intent(Intent.ACTION_SEND).setType("text/markdown").putExtra(Intent.EXTRA_STREAM,second).setPackage(context.getPackageName()).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(share);
        until(activity,"document.querySelector('#reading-content h1')?.textContent === 'Warm share'");
        js(activity,"window.__beforeReload=true; location.reload()");
        until(activity,"!window.__beforeReload && document.querySelector('#reading-content h1')?.textContent === 'Warm share' && document.querySelectorAll('#desktop-library strong').length >= 2");
        assertEquals("1",js(activity,"[...document.querySelectorAll('#desktop-library strong')].filter(n=>n.textContent==='Warm share').length"));
        assertEquals("1",js(activity,"[...document.querySelectorAll('#desktop-library strong')].filter(n=>n.textContent==='Native file test').length"));
        Uri empty = fixture(context,"empty.md","");
        context.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(empty,"text/markdown").setPackage(context.getPackageName()).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_ACTIVITY_NEW_TASK));
        until(activity,"document.querySelector('#sheet').open && document.querySelector('#sheet-content').textContent.includes('empty')");
        assertEquals("true",js(activity,"document.querySelector('#reading-content h1').textContent === 'Warm share'"));
    }
}

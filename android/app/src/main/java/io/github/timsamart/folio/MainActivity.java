package io.github.timsamart.folio;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FolioDevicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

package com.dongocson.workflowcalendar;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WorkflowSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

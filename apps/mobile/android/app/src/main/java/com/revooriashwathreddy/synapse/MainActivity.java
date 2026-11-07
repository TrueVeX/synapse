package com.revooriashwathreddy.synapse;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Razorpay opens UPI apps (GPay, PhonePe, Paytm...) with upi:// or
        // intent:// links. A web view can't follow those itself, so hand them
        // to Android; everything else keeps Capacitor's normal handling.
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
                if (scheme.equals("http") || scheme.equals("https") || scheme.equals("about")
                        || scheme.equals("data") || scheme.equals("blob") || scheme.equals("javascript")
                        || scheme.equals("file")) {
                    return super.shouldOverrideUrlLoading(view, request);
                }
                openExternal(view, uri, scheme);
                return true;
            }
        });
    }

    private void openExternal(WebView view, Uri uri, String scheme) {
        Intent intent;
        try {
            if (scheme.equals("intent")) {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                // Only let the link open apps, never this app's private screens.
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, uri);
            }
        } catch (Exception badLink) {
            return;
        }

        try {
            startActivity(intent);
        } catch (ActivityNotFoundException noApp) {
            String fallback = intent.getStringExtra("browser_fallback_url");
            if (fallback != null && (fallback.startsWith("https://") || fallback.startsWith("http://"))) {
                view.loadUrl(fallback);
            } else {
                Toast.makeText(this, "No app found to complete this payment. Try another option.", Toast.LENGTH_LONG).show();
            }
        }
    }
}

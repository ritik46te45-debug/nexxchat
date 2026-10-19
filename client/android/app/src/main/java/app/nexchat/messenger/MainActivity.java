package app.nexchat.messenger;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Rational;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.app.DownloadManager;
import android.os.Environment;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQ_CODE = 1001;
    private volatile boolean isCallActive = false;

    public class NativeBridge {
        @JavascriptInterface
        public void setCallActive(boolean active) {
            isCallActive = active;
        }

        @JavascriptInterface
        public void enterPiP() {
            runOnUiThread(() -> triggerPictureInPicture());
        }

        @JavascriptInterface
        public void dismissCallNotification() {
            runOnUiThread(() -> {
                NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) {
                    manager.cancelAll();
                }
            });
        }

        @JavascriptInterface
        public void downloadFile(String fileUrl, String fileName, String mimeType) {
            runOnUiThread(() -> {
                try {
                    if (fileUrl == null || fileUrl.trim().isEmpty()) return;
                    String finalFileName = (fileName != null && !fileName.trim().isEmpty()) ? fileName.trim() : ("download_" + System.currentTimeMillis());
                    Uri uri = Uri.parse(fileUrl.trim());

                    DownloadManager.Request request = new DownloadManager.Request(uri);
                    request.setTitle(finalFileName);
                    request.setDescription("Downloading file from NexChat...");
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.allowScanningByMediaScanner();
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, finalFileName);

                    if (mimeType != null && !mimeType.trim().isEmpty()) {
                        request.setMimeType(mimeType.trim());
                    }

                    DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (manager != null) {
                        manager.enqueue(request);
                        Toast.makeText(MainActivity.this, "Downloading " + finalFileName + " to Downloads / Gallery...", Toast.LENGTH_SHORT).show();
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                    Toast.makeText(MainActivity.this, "Download failed: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNativeNotificationChannels();
        requestMediaPermissions();
        handleNotificationIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        configureWebViewSettings();
        handleNotificationIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNotificationIntent(intent);
    }

    private void handleNotificationIntent(Intent intent) {
        if (intent == null || intent.getExtras() == null) return;
        Bundle extras = intent.getExtras();
        String type = extras.getString("type");
        String callId = extras.getString("callId");
        if ("call".equals(type) && callId != null && !callId.isEmpty()) {
            String callerId = extras.getString("callerId", "");
            String callerName = extras.getString("callerName", "Incoming Caller");
            String callType = extras.getString("callType", "voice");
            String conversationId = extras.getString("conversationId", "");

            final String js = String.format(
                "if (typeof window !== 'undefined') {" +
                "  window.__PENDING_INCOMING_CALL = { callId: '%s', callerId: '%s', callerName: '%s', callType: '%s', type: 'call', conversationId: '%s' };" +
                "  window.dispatchEvent(new CustomEvent('nexchat:incoming_call', { detail: window.__PENDING_INCOMING_CALL }));" +
                "}",
                callId, callerId, callerName, callType, conversationId
            );

            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().postDelayed(() -> {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().evaluateJavascript(js, null);
                    }
                }, 300);
            }
        }
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        // If user minimizes/exits the app during an active call, enter WhatsApp-style Picture-in-Picture
        if (isCallActive) {
            triggerPictureInPicture();
        }
    }

    public void triggerPictureInPicture() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(9, 16))
                    .build();
                enterPictureInPictureMode(params);
            } catch (Exception e) {
                // Silently ignore if device/ROM restricts PiP
            }
        }
    }

    private void configureWebViewSettings() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings settings = getBridge().getWebView().getSettings();
            // Allow WebRTC audio/video to play automatically without physical screen touch
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);

            // Register Native JavaScript Bridge for WhatsApp-style PiP & call tracking
            getBridge().getWebView().addJavascriptInterface(new NativeBridge(), "NexChatNative");
        }
    }

    private void createNativeNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            // Remove legacy channels that lacked explicit audio or had broken sound URIs
            try {
                manager.deleteNotificationChannel("nexchat_messages");
                manager.deleteNotificationChannel("nexchat_calls");
                manager.deleteNotificationChannel("nexchat_messages_v2");
                manager.deleteNotificationChannel("nexchat_calls_v2");
            } catch (Exception ignored) {}

            // 1. Messages Channel v3 (Audible Notification Chime)
            NotificationChannel msgChannel = new NotificationChannel(
                "nexchat_messages_v3",
                "Messages",
                NotificationManager.IMPORTANCE_HIGH
            );
            msgChannel.setDescription("Incoming instant messages and chats");
            msgChannel.enableLights(true);
            msgChannel.setLightColor(Color.parseColor("#6366F1"));
            msgChannel.enableVibration(true);
            msgChannel.setVibrationPattern(new long[]{0, 250, 150, 250});
            msgChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            AudioAttributes msgAudio = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                .build();
            Uri defaultNotifUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (defaultNotifUri == null) {
                defaultNotifUri = Settings.System.DEFAULT_NOTIFICATION_URI;
            }
            msgChannel.setSound(defaultNotifUri, msgAudio);
            manager.createNotificationChannel(msgChannel);

            // 2. Calls Channel v3 (Loud WhatsApp-Style Phone Ringtone)
            NotificationChannel callChannel = new NotificationChannel(
                "nexchat_calls_v3",
                "Voice & Video Calls",
                NotificationManager.IMPORTANCE_HIGH
            );
            callChannel.setDescription("Incoming voice and video call alerts");
            callChannel.enableLights(true);
            callChannel.setLightColor(Color.parseColor("#10B981"));
            callChannel.enableVibration(true);
            callChannel.setVibrationPattern(new long[]{0, 1000, 1000, 1000, 1000});
            callChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            AudioAttributes callAudio = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .build();
            Uri defaultRingtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (defaultRingtoneUri == null) {
                defaultRingtoneUri = Settings.System.DEFAULT_RINGTONE_URI;
            }
            callChannel.setSound(defaultRingtoneUri, callAudio);
            manager.createNotificationChannel(callChannel);
        }
    }

    private void requestMediaPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            String[] permissions = {
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.MODIFY_AUDIO_SETTINGS
            };
            List<String> needed = new ArrayList<>();
            for (String perm : permissions) {
                if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(perm);
                }
            }
            if (!needed.isEmpty()) {
                ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERMISSION_REQ_CODE);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQ_CODE) {
            configureWebViewSettings();
        }
    }
}

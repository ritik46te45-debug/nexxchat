package app.nexchat.messenger;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PictureInPictureParams;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.MediaScannerConnection;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.util.Rational;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQ_CODE = 1001;
    private static final String TAG = "NexChatNative";
    private volatile boolean isCallActive = false;
    private final ExecutorService downloadExecutor = Executors.newFixedThreadPool(4);

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
            if (fileUrl == null || fileUrl.trim().isEmpty()) return;
            downloadExecutor.execute(() -> saveFileToStorage(fileUrl.trim(), fileName, mimeType));
        }
    }

    private void saveFileToStorage(String rawUrl, String rawFileName, String rawMimeType) {
        String safeName = (rawFileName != null && !rawFileName.trim().isEmpty())
                ? rawFileName.trim()
                : ("nexchat_" + System.currentTimeMillis());
        String cleanName = safeName.replaceAll("[\\\\/:*?\"<>|]", "_").replaceAll("[^a-zA-Z0-9._-]", "_");

        String mimeType = (rawMimeType != null && !rawMimeType.trim().isEmpty() && !rawMimeType.equals("application/octet-stream"))
                ? rawMimeType.trim().toLowerCase()
                : "";

        String lowerName = cleanName.toLowerCase();
        if (mimeType.isEmpty()) {
            if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) mimeType = "image/jpeg";
            else if (lowerName.endsWith(".png")) mimeType = "image/png";
            else if (lowerName.endsWith(".webp")) mimeType = "image/webp";
            else if (lowerName.endsWith(".gif")) mimeType = "image/gif";
            else if (lowerName.endsWith(".svg")) mimeType = "image/svg+xml";
            else if (lowerName.endsWith(".mp4")) mimeType = "video/mp4";
            else if (lowerName.endsWith(".webm")) mimeType = "video/webm";
            else if (lowerName.endsWith(".mkv")) mimeType = "video/x-matroska";
            else if (lowerName.endsWith(".mov")) mimeType = "video/quicktime";
            else if (lowerName.endsWith(".3gp")) mimeType = "video/3gpp";
            else if (lowerName.endsWith(".mp3")) mimeType = "audio/mpeg";
            else if (lowerName.endsWith(".wav")) mimeType = "audio/wav";
            else if (lowerName.endsWith(".ogg")) mimeType = "audio/ogg";
            else if (lowerName.endsWith(".m4a")) mimeType = "audio/mp4";
            else if (lowerName.endsWith(".pdf")) mimeType = "application/pdf";
            else if (lowerName.endsWith(".doc")) mimeType = "application/msword";
            else if (lowerName.endsWith(".docx")) mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            else if (lowerName.endsWith(".xls")) mimeType = "application/vnd.ms-excel";
            else if (lowerName.endsWith(".xlsx")) mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            else if (lowerName.endsWith(".zip")) mimeType = "application/zip";
            else if (lowerName.endsWith(".apk")) mimeType = "application/vnd.android.package-archive";
            else mimeType = "application/octet-stream";
        }

        if (!cleanName.contains(".")) {
            if (mimeType.equals("image/jpeg")) cleanName += ".jpg";
            else if (mimeType.equals("image/png")) cleanName += ".png";
            else if (mimeType.equals("image/webp")) cleanName += ".webp";
            else if (mimeType.equals("video/mp4")) cleanName += ".mp4";
            else if (mimeType.equals("application/pdf")) cleanName += ".pdf";
        }

        final boolean isImage = mimeType.startsWith("image/");
        final boolean isVideo = mimeType.startsWith("video/");
        final String finalCleanName = cleanName;
        final String finalMimeType = mimeType;

        runOnUiThread(() -> {
            String target = isImage ? "Gallery (Pictures/NexChat)" : (isVideo ? "Gallery (Movies/NexChat)" : "Downloads/NexChat");
            Toast.makeText(MainActivity.this, "Saving " + finalCleanName + " to " + target + "...", Toast.LENGTH_SHORT).show();
        });

        String targetUrl = rawUrl;
        if (targetUrl.startsWith("/")) {
            targetUrl = "https://nexxchat-5d29.onrender.com" + targetUrl;
        }

        InputStream in = null;
        HttpURLConnection conn = null;

        try {
            if (targetUrl.startsWith("data:")) {
                int commaIndex = targetUrl.indexOf(',');
                if (commaIndex != -1) {
                    byte[] data = Base64.decode(targetUrl.substring(commaIndex + 1), Base64.DEFAULT);
                    writeBytesToStorage(data, finalCleanName, finalMimeType, isImage, isVideo);
                    return;
                }
            }

            URL url = new URL(targetUrl);
            conn = openFollowRedirectConnection(url);
            int responseCode = conn.getResponseCode();

            if ((responseCode < 200 || responseCode >= 300) && !targetUrl.contains("/api/upload/download")) {
                if (conn != null) conn.disconnect();
                String proxyUrl = "https://nexxchat-5d29.onrender.com/api/upload/download?url=" +
                        URLEncoder.encode(targetUrl, "UTF-8") + "&filename=" + URLEncoder.encode(finalCleanName, "UTF-8");
                url = new URL(proxyUrl);
                conn = openFollowRedirectConnection(url);
                responseCode = conn.getResponseCode();
            }

            if (responseCode < 200 || responseCode >= 300) {
                throw new Exception("Server returned HTTP " + responseCode);
            }

            in = conn.getInputStream();
            writeStreamToStorage(in, finalCleanName, finalMimeType, isImage, isVideo);

        } catch (Exception e) {
            Log.e(TAG, "Failed to download " + finalCleanName, e);
            runOnUiThread(() -> {
                try {
                    Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(rawUrl));
                    browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(browserIntent);
                    Toast.makeText(MainActivity.this, "Opening download in browser...", Toast.LENGTH_SHORT).show();
                } catch (Exception ex) {
                    Toast.makeText(MainActivity.this, "Download error: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        } finally {
            if (in != null) try { in.close(); } catch (Exception ignored) {}
            if (conn != null) try { conn.disconnect(); } catch (Exception ignored) {}
        }
    }

    private HttpURLConnection openFollowRedirectConnection(URL url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android " + Build.VERSION.RELEASE + "; " + Build.MODEL + ") AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
        conn.connect();

        int code = conn.getResponseCode();
        if (code == HttpURLConnection.HTTP_MOVED_PERM || code == HttpURLConnection.HTTP_MOVED_TEMP || code == 307 || code == 308) {
            String newUrl = conn.getHeaderField("Location");
            if (newUrl != null && !newUrl.isEmpty()) {
                conn.disconnect();
                return openFollowRedirectConnection(new URL(newUrl));
            }
        }
        return conn;
    }

    private void writeStreamToStorage(InputStream in, String cleanName, String mimeType, boolean isImage, boolean isVideo) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, cleanName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            Uri collection;
            if (isImage) {
                collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/NexChat");
            } else if (isVideo) {
                collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/NexChat");
            } else {
                collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/NexChat");
            }

            Uri itemUri = resolver.insert(collection, values);
            if (itemUri == null) {
                throw new Exception("Failed to create MediaStore entry for " + cleanName);
            }

            try (OutputStream out = resolver.openOutputStream(itemUri)) {
                if (out == null) throw new Exception("Failed to open output stream");
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = in.read(buffer)) != -1) {
                    out.write(buffer, 0, bytesRead);
                }
                out.flush();
            }

            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(itemUri, values, null, null);

        } else {
            File targetDir;
            if (isImage) {
                targetDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "NexChat");
            } else if (isVideo) {
                targetDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "NexChat");
            } else {
                targetDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "NexChat");
            }
            if (!targetDir.exists()) {
                targetDir.mkdirs();
            }

            File targetFile = new File(targetDir, cleanName);
            if (targetFile.exists()) {
                int dot = cleanName.lastIndexOf('.');
                String base = dot > 0 ? cleanName.substring(0, dot) : cleanName;
                String ext = dot > 0 ? cleanName.substring(dot) : "";
                targetFile = new File(targetDir, base + "_" + System.currentTimeMillis() + ext);
            }

            try (FileOutputStream out = new FileOutputStream(targetFile)) {
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = in.read(buffer)) != -1) {
                    out.write(buffer, 0, bytesRead);
                }
                out.flush();
            }

            MediaScannerConnection.scanFile(
                    MainActivity.this,
                    new String[]{targetFile.getAbsolutePath()},
                    new String[]{mimeType},
                    null
            );
        }

        runOnUiThread(() -> {
            String dest = isImage ? "Gallery (Pictures/NexChat)" : (isVideo ? "Gallery (Movies/NexChat)" : "Downloads/NexChat");
            Toast.makeText(MainActivity.this, "Saved " + cleanName + " to " + dest, Toast.LENGTH_LONG).show();
        });
    }

    private void writeBytesToStorage(byte[] data, String cleanName, String mimeType, boolean isImage, boolean isVideo) throws Exception {
        ByteArrayInputStream bis = new ByteArrayInputStream(data);
        writeStreamToStorage(bis, cleanName, mimeType, isImage, isVideo);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNativeNotificationChannels();
        requestMediaPermissions();
        configureWebViewSettings();
        handleNotificationIntent(getIntent());
    }

    @Override
    public void onStart() {
        super.onStart();
        configureWebViewSettings();
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
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);

            // Register Native JavaScript Bridge for WhatsApp-style PiP, downloads & call tracking
            getBridge().getWebView().addJavascriptInterface(new NativeBridge(), "NexChatNative");

            // Attach DownloadListener for ANY in-page downloads (<a download>, window.open, etc.)
            getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
                String guessedName = URLUtil.guessFileName(url, contentDisposition, mimetype);
                new NativeBridge().downloadFile(url, guessedName, mimetype);
            });
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
            List<String> needed = new ArrayList<>();
            List<String> permissions = new ArrayList<>();
            permissions.add(Manifest.permission.CAMERA);
            permissions.add(Manifest.permission.RECORD_AUDIO);
            permissions.add(Manifest.permission.MODIFY_AUDIO_SETTINGS);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS);
                permissions.add(Manifest.permission.READ_MEDIA_IMAGES);
                permissions.add(Manifest.permission.READ_MEDIA_VIDEO);
                permissions.add(Manifest.permission.READ_MEDIA_AUDIO);
            } else if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
                permissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
                permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }

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

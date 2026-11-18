package com.datahearth.player

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

class DownloadState(
    val active: Boolean,
    val count: Int,
    val done: Int,
    val title: String,
    val percent: Int,
)

/**
 * Only the foreground state and the notification live here: the transfers run in the Rust queue,
 * which pushes its progress through PlayerPlugin.downloadsService.
 */
class DownloadService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        running = true
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            progress(this, latest),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
        )
        // The queue can go idle between startForegroundService and here, when apply() saw no service to stop.
        if (!latest.active) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
        return START_NOT_STICKY
    }

    // dataSync services get a 6 h budget on API 35+; not stopping within seconds crashes the app.
    override fun onTimeout(startId: Int, fgsType: Int) = paused()

    override fun onTimeout(startId: Int) = paused()

    private fun paused() {
        blocked = true
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        if (!canNotify(this)) return
        val note = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_download)
            .setContentTitle(getString(R.string.downloads_paused))
            .setContentText(getString(R.string.downloads_paused_text))
            .setAutoCancel(true)
            .setContentIntent(openApp(this))
            .build()
        NotificationManagerCompat.from(this).notify(PAUSED_ID, note)
    }

    override fun onDestroy() {
        running = false
    }

    companion object {
        private const val TAG = "DownloadService"
        private const val CHANNEL_ID = "downloads"
        private const val NOTIFICATION_ID = 7001
        private const val PAUSED_ID = 7002

        @Volatile
        var appContext: Context? = null

        @Volatile
        var latest = DownloadState(false, 0, 0, "", -1)

        @Volatile
        var running = false

        // Set by the timeout, cleared when the user is back in the app: restarting then resets the window.
        @Volatile
        var blocked = false

        /** False when the OS refused to start the service or it is blocked after a timeout. */
        fun apply(ctx: Context, state: DownloadState): Boolean {
            latest = state
            if (!state.active) {
                if (running) ctx.stopService(Intent(ctx, DownloadService::class.java))
                return true
            }
            if (blocked) return false
            if (running) {
                if (canNotify(ctx)) NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, progress(ctx, state))
                return true
            }
            return try {
                ContextCompat.startForegroundService(ctx, Intent(ctx, DownloadService::class.java))
                true
            } catch (e: IllegalStateException) {
                Log.w(TAG, "foreground start refused", e)
                false
            } catch (e: SecurityException) {
                Log.w(TAG, "foreground start refused", e)
                false
            }
        }

        private fun canNotify(ctx: Context) =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

        private fun ensureChannel(ctx: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val channel = NotificationChannel(
                CHANNEL_ID,
                ctx.getString(R.string.downloads_channel),
                NotificationManager.IMPORTANCE_LOW,
            )
            ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        private fun openApp(ctx: Context): PendingIntent {
            val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!
                .putExtra("route", "/downloads")
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            return PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }

        private fun progress(ctx: Context, state: DownloadState): Notification {
            ensureChannel(ctx)
            val text = when {
                state.count > 1 -> ctx.getString(R.string.downloads_progress, minOf(state.done + 1, state.count), state.count)
                state.percent >= 0 -> "${state.percent}%"
                else -> ""
            }
            return NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_download)
                .setContentTitle(state.title.ifEmpty { ctx.getString(R.string.downloads_title) })
                .setContentText(text)
                .setProgress(100, state.percent.coerceAtLeast(0), state.percent < 0)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setContentIntent(openApp(ctx))
                .build()
        }
    }
}

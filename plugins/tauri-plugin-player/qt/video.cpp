// Video under the page on the Qt runtime: a QOpenGLWidget that libmpv draws into through its
// OpenGL render API, a sibling of the QWebEngineView and stacked below it. One window, one
// compositor surface, so the page's controls and panels blend over the picture.
#include <QColor>
#include <QEvent>
#include <QGuiApplication>
#include <QMetaObject>
#include <QOpenGLContext>
#include <QOpenGLWidget>
#include <QScreen>
#include <QThread>
#include <QWebEnginePage>
#include <QWidget>
#include <cstring>
#include <mpv/client.h>
#include <mpv/render_gl.h>

namespace {

class Video;
Video *g_video = nullptr;
QWebEnginePage *g_page = nullptr;
void (*g_resized)() = nullptr;

class Video : public QOpenGLWidget {
public:
  Video(QWidget *parent, mpv_handle *mpv) : QOpenGLWidget(parent), mpv(mpv) {
    parent->installEventFilter(this);
    setGeometry(parent->rect());
  }

  // The render context holds GL objects, so it goes before Qt drops the GL context.
  ~Video() override {
    if (!render) return;
    makeCurrent();
    mpv_render_context_free(render);
    doneCurrent();
  }

protected:
  bool eventFilter(QObject *o, QEvent *e) override {
    if (e->type() == QEvent::Resize) setGeometry(static_cast<QWidget *>(o)->rect());
    return false;
  }

  void initializeGL() override {
    mpv_opengl_init_params gl{[](void *, const char *name) -> void * {
                                auto *ctx = QOpenGLContext::currentContext();
                                return ctx ? reinterpret_cast<void *>(ctx->getProcAddress(name)) : nullptr;
                              },
                              nullptr};
    mpv_render_param params[4] = {{MPV_RENDER_PARAM_API_TYPE, const_cast<char *>(MPV_RENDER_API_TYPE_OPENGL)},
                                  {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &gl},
                                  {MPV_RENDER_PARAM_INVALID, nullptr},
                                  {MPV_RENDER_PARAM_INVALID, nullptr}};
#if QT_CONFIG(wayland)
    // With the Wayland display, VA-API frames reach GL as dmabufs instead of being copied back.
    if (auto *wl = qGuiApp->nativeInterface<QNativeInterface::QWaylandApplication>())
      params[2] = {MPV_RENDER_PARAM_WL_DISPLAY, wl->display()};
#endif
    if (int err = mpv_render_context_create(&render, mpv, params); err < 0) {
      qWarning("mpv render context failed: %s", mpv_error_string(err));
      render = nullptr;
      return;
    }
    // mpv calls this from its own threads; the widget belongs to the Qt one.
    mpv_render_context_set_update_callback(
        render, [](void *self) { QMetaObject::invokeMethod(static_cast<Video *>(self), [self] { static_cast<Video *>(self)->update(); }, Qt::QueuedConnection); }, this);
    if (auto *s = screen())
      mpv_set_property_string(mpv, "display-fps-override", QByteArray::number(s->refreshRate()).constData());
  }

  void resizeGL(int, int) override {
    if (g_resized) g_resized();
  }

  void paintGL() override {
    if (!render) return;
    const qreal dpr = devicePixelRatioF();
    mpv_opengl_fbo fbo{static_cast<int>(defaultFramebufferObject()), qRound(width() * dpr), qRound(height() * dpr), 0};
    int flip = 1;
    // Qt also repaints the widget whenever the page above it repaints. mpv would hold each of
    // those repaints until the video frame's display time, stalling the page for frames on end.
    int block = 0;
    mpv_render_param params[] = {{MPV_RENDER_PARAM_OPENGL_FBO, &fbo},
                                 {MPV_RENDER_PARAM_FLIP_Y, &flip},
                                 {MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME, &block},
                                 {MPV_RENDER_PARAM_INVALID, nullptr}};
    mpv_render_context_render(render, params);
  }

private:
  mpv_handle *mpv;
  mpv_render_context *render = nullptr;
};

} // namespace

extern "C" {

void slp_video_see_through(int on) {
  if (g_page) g_page->setBackgroundColor(on ? QColor(Qt::transparent) : QColor(Qt::black));
  if (g_video) g_video->setVisible(on);
}

void slp_video_attach(void *view, void *page, mpv_handle *mpv, void (*resized)()) {
  auto *web = static_cast<QWidget *>(view);
  g_page = static_cast<QWebEnginePage *>(page);
  g_resized = resized;
  g_video = new Video(web->parentWidget(), mpv);
  g_video->lower();
  slp_video_see_through(0);
}

int slp_video_size(double *w, double *h, double *scale) {
  if (!g_video) return 0;
  *w = g_video->width();
  *h = g_video->height();
  *scale = g_video->devicePixelRatioF();
  return 1;
}

// The monitor the window is on, in device pixels.
int slp_video_display(char *name, int cap, unsigned *w, unsigned *h, double *hz) {
  QScreen *s = g_video ? g_video->screen() : QGuiApplication::primaryScreen();
  if (!s) return 0;
  std::strncpy(name, s->model().toUtf8().constData(), cap - 1);
  name[cap - 1] = 0;
  // On Wayland a screen only reports a whole scale (2 at 1.6); the window has the real one.
  const qreal dpr = g_video ? g_video->devicePixelRatioF() : s->devicePixelRatio();
  *w = qRound(s->geometry().width() * dpr);
  *h = qRound(s->geometry().height() * dpr);
  *hz = s->refreshRate();
  return 1;
}

// Runs f on the Qt thread and waits for it.
void slp_on_main(void (*f)(void *), void *ctx) {
  if (QThread::currentThread() == qGuiApp->thread())
    f(ctx);
  else
    QMetaObject::invokeMethod(qGuiApp, [=] { f(ctx); }, Qt::BlockingQueuedConnection);
}
}

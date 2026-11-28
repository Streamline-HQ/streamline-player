//! Video under the page on Linux: `qt/video.cpp` puts a QOpenGLWidget that libmpv draws into
//! below the QWebEngineView. This side keeps the picture's rectangle and the subtitle lift.

use crate::{
    mpv,
    probe::{self, Display, Rect},
};
use std::{
    cell::{Cell, RefCell},
    ffi::{CStr, c_char, c_int, c_uint, c_void},
    sync::Arc,
};

unsafe extern "C" {
    fn slp_video_attach(
        view: *mut c_void,
        page: *mut c_void,
        mpv: *mut c_void,
        resized: extern "C" fn(),
    );
    fn slp_video_see_through(on: c_int);
    fn slp_video_size(w: *mut f64, h: *mut f64, scale: *mut f64) -> c_int;
    fn slp_video_display(
        name: *mut c_char,
        cap: c_int,
        w: *mut c_uint,
        h: *mut c_uint,
        hz: *mut f64,
    ) -> c_int;
    fn slp_on_main(f: extern "C" fn(*mut c_void), ctx: *mut c_void);
}

thread_local! {
    static PLAYER: RefCell<Option<Arc<mpv::Mpv>>> = const { RefCell::new(None) };
    static RECT: Cell<Option<Rect>> = const { Cell::new(None) };
    static LIFT: Cell<f64> = const { Cell::new(0.0) };
}

extern "C" fn resized() {
    apply_layout();
}

/// Puts the video widget under the webview. Runs on the Qt thread.
pub fn attach(view: *mut c_void, page: *mut c_void, player: Arc<mpv::Mpv>) {
    let raw = player.raw();
    PLAYER.with(|p| *p.borrow_mut() = Some(player));
    unsafe { slp_video_attach(view, page, raw, resized) };
}

/// Lets the picture show through the page; the page stays opaque and the video widget hidden
/// while nothing plays.
pub fn see_through(on: bool) {
    unsafe { slp_video_see_through(on.into()) };
}

/// Runs `f` on the Qt thread and waits for it.
pub fn on_ui<T, F: FnOnce() -> T>(f: F) -> Option<T> {
    struct Call<F, T>(Option<F>, Option<T>);
    extern "C" fn run<T, F: FnOnce() -> T>(ctx: *mut c_void) {
        let call = unsafe { &mut *ctx.cast::<Call<F, T>>() };
        call.1 = call.0.take().map(|f| f());
    }
    let mut call = Call(Some(f), None);
    unsafe { slp_on_main(run::<T, F>, (&raw mut call).cast()) };
    call.1
}

/// Puts the picture in `rect`, or back over the whole window.
pub fn place(rect: Option<Rect>) {
    RECT.with(|r| r.set(rect));
    apply_layout();
}

/// Raises subtitles `px` CSS pixels above where mpv puts them.
pub fn lift(px: f64) {
    LIFT.with(|l| l.set(px));
    apply_lift();
}

fn area_size() -> Option<(f64, f64, f64)> {
    let (mut w, mut h, mut scale) = (0.0, 0.0, 1.0);
    (unsafe { slp_video_size(&mut w, &mut h, &mut scale) } != 0).then_some((w, h, scale))
}

// The margins are ratios and a lift is in the window's own pixels, so both follow a resize.
fn apply_layout() {
    let Some(player) = PLAYER.with(|p| p.borrow().clone()) else {
        return;
    };
    let Some((width, height, _)) = area_size() else {
        return;
    };
    let ratios = probe::margin_ratios(RECT.with(Cell::get), width, height);
    for (side, ratio) in ["left", "right", "top", "bottom"].iter().zip(ratios) {
        let _ = player.set(&format!("video-margin-ratio-{side}"), &ratio.to_string());
    }
    apply_lift();
}

fn apply_lift() {
    let Some(player) = PLAYER.with(|p| p.borrow().clone()) else {
        return;
    };
    let Some((_, height, scale)) = area_size() else {
        return;
    };
    let margin = probe::sub_margin_y(LIFT.with(Cell::get), scale, height * scale);
    // Off the Qt thread: mpv answers a property write between two frames, and waiting for it
    // here stalls the page just as the controls start to fade.
    std::thread::spawn(move || {
        // mpv takes whole pixels here and refuses a fraction.
        let _ = player.set("sub-margin-y", &(margin.round() as i64).to_string());
    });
}

/// The monitor the window is on, in device pixels.
pub fn display() -> Display {
    let mut name = [0 as c_char; 128];
    let (mut width, mut height, mut refresh_hz) = (0, 0, 0.0);
    if unsafe {
        slp_video_display(
            name.as_mut_ptr(),
            name.len() as c_int,
            &mut width,
            &mut height,
            &mut refresh_hz,
        )
    } == 0
    {
        return Display::default();
    }
    Display {
        name: unsafe { CStr::from_ptr(name.as_ptr()) }
            .to_string_lossy()
            .into_owned(),
        width,
        height,
        refresh_hz,
    }
}

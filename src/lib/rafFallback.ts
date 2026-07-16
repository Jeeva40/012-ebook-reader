// epub.js drives its internal render queue with requestAnimationFrame, which
// browsers suspend indefinitely for hidden/backgrounded tabs. Without this,
// opening the EPUB reader in a background tab hangs forever with no error.
// Falling back to setTimeout only while hidden keeps normal rAF timing (used
// by React and other animations) untouched for the common visible-tab case.
const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window)

window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
  if (document.hidden) {
    return window.setTimeout(() => callback(performance.now()), 16)
  }
  return nativeRequestAnimationFrame(callback)
}

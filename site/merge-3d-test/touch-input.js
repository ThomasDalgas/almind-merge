// Godot's web export forwards every pointermove as mouse motion, including
// touch pointers. Keep its native touch events, which drive relative aiming,
// while preventing the duplicate absolute mouse update from the same finger.
export function installTouchInputGuard(target) {
 const filter = event => {
  if (event.pointerType === 'touch') event.stopImmediatePropagation();
 };
 target.addEventListener('pointermove', filter, {capture:true});
 return () => target.removeEventListener('pointermove', filter, {capture:true});
}

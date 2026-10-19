/**
 * Offline OCM fixture harness — no device.
 * Run: node --experimental-vm-modules tools/path-tracing-playground/run-fixtures.mjs
 * Prefer: npx jest src/shapeEngine/chamferSphere.fixture.test.ts
 *
 * This file documents the bars; jest is the real gate.
 */
console.log(
  JSON.stringify(
    {
      bars: {
        sphere: '>= 0.90 and passed',
        blank: '<= 0.05 and not passed',
        clutter: '<= 0.25 and not passed',
      },
      method: 'Oriented Chamfer + NOCD-lite line normalizers',
      run: 'npx jest src/shapeEngine/chamferSphere.fixture.test.ts --no-cache',
    },
    null,
    2,
  ),
);

// TC-05 — Repeated legal play
// Проверяем несколько последовательных ходов.
// После каждого хода WARDEN заново читает реальную доску и пересчитывает
// legal moves. Очередь ходов заранее не строится, потому что каскад и refill
// сразу делают старое состояние недействительным.

(async () => {
  const warden =
    window.warden ||
    (window.warden = await WARDEN.init({
      rows: 7,
      cols: 7,
      cellSize: 72,
      expectedTypes: 6
    }));

  const expectedSteps = 10;

  const history =
    await warden.run({
      maxSteps: expectedSteps,
      pause: 350
    });

  const moved =
    history.filter(
      item => item.status === 'MOVED'
    );

  warden.assert(
    moved.length === expectedSteps,
    `TC-05: expected ${expectedSteps} successful moves, got ${moved.length}`
  );

  console.log('[TC-05] PASS', history);
})();

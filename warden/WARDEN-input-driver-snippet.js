// WARDEN / TAPCLAP
// WARDEN-input-driver-snippet.js
//
// Назначение:
// Изолировать браузерный ввод от solver и Cocos adapter.
//
// board reader отвечает только за наблюдение состояния;
// solver отвечает только за выбор допустимого хода;
// input driver отвечает только за имитацию пользовательского действия.
//
// Если позже для мобильной проверки понадобится TouchEvent или PointerEvent,
// достаточно заменить/расширить этот модуль, не переписывая ядро.

(() => {
  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  function create(userConfig = {}) {
    const config = {
      dragDuration: 160,
      dragSteps: 6,
      ...userConfig
    };

    function canvas() {
      const node =
        document.querySelector('#gameCanvas');

      if (!node) {
        throw new Error('WARDEN: #gameCanvas not found');
      }

      return node;
    }

    function mouse(type, point, buttons) {
      const target = canvas();

      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: point.x,
          clientY: point.y,
          screenX: window.screenX + point.x,
          screenY: window.screenY + point.y,
          button: 0,
          buttons
        })
      );
    }

    async function drag(
      from,
      to,
      {
        duration = config.dragDuration,
        steps = config.dragSteps
      } = {}
    ) {
      if (!from || !to) {
        throw new Error('WARDEN: drag requires from/to points');
      }

      mouse('mousedown', from, 1);

      for (let i = 1; i <= steps; i++) {
        const ratio = i / steps;

        mouse(
          'mousemove',
          {
            x: from.x + (to.x - from.x) * ratio,
            y: from.y + (to.y - from.y) * ratio
          },
          1
        );

        await sleep(duration / steps);
      }

      mouse('mouseup', to, 0);
    }

    async function click(point) {
      mouse('mousedown', point, 1);
      await sleep(30);
      mouse('mouseup', point, 0);
    }

    return {
      drag,
      click
    };
  }

  window.WARDENInputDriver = {
    create
  };

  console.log('[WARDEN] input driver loaded');
})();

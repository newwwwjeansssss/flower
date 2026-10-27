import { DEFAULT_TIME_LIMIT, isValidTimeLimit } from '../../level-timing.js?v=20261022-mechanics-audit';

export function renderTimeLimitInput(input, level) {
  input.value = level.timeLimit ?? DEFAULT_TIME_LIMIT;
  input.setCustomValidity('');
}

export function bindTimeLimitInput(input, store) {
  input.onchange = () => {
    const value = input.valueAsNumber;
    input.setCustomValidity(isValidTimeLimit(value) ? '' : '请输入大于 0 的整数秒数');
    if (!isValidTimeLimit(value)) { input.reportValidity(); return; }
    if (store.currentLevel.timeLimit !== value) store.updateLevel({ timeLimit: value });
  };
}

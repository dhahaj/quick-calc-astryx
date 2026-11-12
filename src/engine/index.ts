/** QuickCalc engine: parser, units and formatting. No UI or Electron imports anywhere in this folder. */

export { Engine, Result, type EngineOptions } from './engine';
export { CalcError, CalcSyntaxError, EvaluationError, UnitMismatchError } from './errors';
export { MODES, type FormatMode, type FormatSettings, formatNumber, formatSettings } from './formatter';
export { Quantity, Unit, type Value } from './quantity';
export { CUSTOM_UNITS_TEMPLATE, type CustomUnitsSource } from './units';

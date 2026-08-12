import React from "react";

// 原生端（iOS / Android）占位组件。
// react-datepicker 仅用于 Web，且绝不能打进原生包（它依赖 DOM）。
// 真正实现位于 WebDatePicker.web.tsx，Metro 只会在 web 平台解析该文件；
// 原生平台会解析到此 stub，从而把 react-datepicker 完全排除在原生构建之外。
export default function WebDatePicker(_props: {
  value: Date;
  onChange: (date: Date) => void;
}): React.ReactElement | null {
  return null;
}

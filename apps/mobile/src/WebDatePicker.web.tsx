import { useEffect } from "react";
import ReactDatePicker from "react-datepicker";
import { zhCN } from "date-fns/locale";
import { reactDatePickerCss } from "./webDatePickerCss";
import { colors, radius } from "./theme";

// 本文件仅由 Metro 在 web 平台解析（对应 WebDatePicker.tsx 为原生占位）。
// Expo Web 使用 Metro 打包器，无法处理 .css 导入，因此把 react-datepicker 的
// 基础样式以字符串形式注入 <style>（见 webDatePickerCss.ts），再叠加品牌主题。

const STYLE_ID = "psy-react-datepicker-style";

const themeOverride = `
.react-datepicker {
  font-family: inherit;
  border: 1px solid ${colors.line};
  border-radius: ${radius.lg}px;
  background: ${colors.surface};
  box-shadow: 0 12px 32px rgba(99, 71, 50, 0.14);
  overflow: hidden;
}
.react-datepicker__header {
  background: ${colors.surfaceSoft};
  border-bottom: 1px solid ${colors.line};
  padding-top: 12px;
}
.react-datepicker__current-month {
  color: ${colors.ink};
  font-weight: 800;
  font-size: 15px;
}
.react-datepicker__day-name,
.react-datepicker__day,
.react-datepicker__time-name {
  color: ${colors.ink};
  width: 2rem;
  line-height: 2rem;
  margin: 2px;
}
.react-datepicker__day--today {
  color: ${colors.clayDark};
  font-weight: 800;
}
.react-datepicker__day--selected,
.react-datepicker__day--keyboard-selected,
.react-datepicker__day--selected:hover {
  background: ${colors.clayDark};
  color: #ffffff;
  border-radius: ${radius.pill}px;
}
.react-datepicker__day:hover {
  background: ${colors.surfaceSoft};
  border-radius: ${radius.pill}px;
}
.react-datepicker__navigation-icon::before {
  border-color: ${colors.clayDark};
}
.react-datepicker__time-container {
  border-left: 1px solid ${colors.line};
  width: 92px;
}
.react-datepicker__time-list-item--selected,
.react-datepicker__time-list-item--selected:hover {
  background: ${colors.clayDark} !important;
  color: #ffffff !important;
}
.react-datepicker__time-list-item:hover {
  background: ${colors.surfaceSoft};
}
.react-datepicker__triangle {
  display: none;
}
`;

export default function WebDatePicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (date: Date) => void;
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = reactDatePickerCss + "\n" + themeOverride;
    document.head.appendChild(style);
  }, []);

  return (
    <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <ReactDatePicker
        selected={value}
        onChange={(date: Date | null) => {
          if (date) onChange(date);
        }}
        showTimeSelect
        timeFormat="HH:mm"
        timeIntervals={5}
        timeCaption="时间"
        dateFormat="yyyy-MM-dd HH:mm"
        inline
        locale={zhCN}
        calendarClassName="psy-react-datepicker"
        showPopperArrow={false}
      />
    </div>
  );
}

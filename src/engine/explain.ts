import { fmt, money } from "./check";
import { CheckResult, Finding, Project, WorkerResult } from "./types";

export type Lang = "en" | "es";

const DAY_NAMES: Record<Lang, string[]> = {
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  es: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
};

const n = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2));

/**
 * A plain-language pay explanation a worker can read on their phone.
 * Template-based (no AI), so the numbers always match the check results.
 */
export function explainPay(r: WorkerResult, project: Project, findings: Finding[], lang: Lang): string[] {
  const w = r.worker;
  const mine = findings.filter((f) => f.workerId === w.id);
  const unmapped = mine.some((f) => f.rule === "UNMAPPED_CLASSIFICATION");
  const fringeCredit = r.fringePaidPerHour - w.cashInLieuPerHour;
  const net = money(w.grossReported - w.deductions);
  const days = r.overRatioDays.map((d) => DAY_NAMES[lang][d]).join(lang === "es" ? " y " : " and ");
  const basic = Math.max(w.basePaid, r.requiredBase ?? 0);
  const out: string[] = [];

  if (lang === "es") {
    const role =
      r.status === "registered-apprentice"
        ? ` (aprendiz registrado, nivel ${w.apprentice!.levelPercent}%)`
        : r.status === "unregistered-apprentice"
          ? " (aprendiz sin registro válido)"
          : "";
    out.push(`Esta semana trabajó ${n(r.totalHours)} horas en ${project.name} como ${w.classification}${role}.`);
    if (unmapped || r.requiredBase === null) {
      out.push("Su puesto todavía no aparece en las tarifas salariales del proyecto. El equipo de nómina lo está corrigiendo antes de presentar el informe.");
    } else {
      if (r.status === "unregistered-apprentice")
        out.push(`Como no hay un registro de aprendiz válido, se le debe pagar la tarifa completa de ${w.classification}.`);
      out.push(
        `En este proyecto, la ley fija su pago mínimo en ${fmt(r.requiredBase)}/hora de salario más ${fmt(r.requiredFringe!)}/hora en beneficios (${fmt(r.requiredBase + r.requiredFringe!)}/hora en total).`,
      );
      if (days) out.push(`El ${days} hubo más aprendices en el sitio de los que permite el programa, así que esas horas deben pagarse a la tarifa completa.`);
      out.push(
        `Se le pagó ${fmt(w.basePaid)}/hora de salario${w.cashInLieuPerHour ? `, ${fmt(w.cashInLieuPerHour)}/hora en efectivo en lugar de beneficios` : ""} y ${fmt(fringeCredit)}/hora en beneficios.`,
      );
      if (r.otHours > 0)
        out.push(`${n(r.otHours)} de sus horas pasaron de 40 y deben pagarse al menos a ${fmt(1.5 * basic)}/hora. Se le pagaron a ${fmt(w.otRatePaid)}/hora.`);
      out.push(
        r.owed > 0
          ? `Nuestra revisión encontró que se le deben ${fmt(r.owed)} adicionales por esta semana. El equipo de nómina de su empleador está revisando la corrección.`
          : "Su pago cumple con los requisitos de salario prevaleciente del proyecto.",
      );
    }
    out.push(`Pago bruto en este proyecto: ${fmt(w.grossReported)}. Deducciones: ${fmt(w.deductions)}. Neto: ${fmt(net)}.`);
    out.push("¿Preguntas? Consulte con su contacto de nómina. También puede llamar a la División de Salarios y Horas del Departamento de Trabajo de EE. UU. al 1-866-487-9243.");
    return out;
  }

  const role =
    r.status === "registered-apprentice"
      ? ` (registered apprentice, ${w.apprentice!.levelPercent}% level)`
      : r.status === "unregistered-apprentice"
        ? " (apprentice without a valid registration)"
        : "";
  out.push(`This week you worked ${n(r.totalHours)} hours on ${project.name} as ${w.classification}${role}.`);
  if (unmapped || r.requiredBase === null) {
    out.push("Your job title isn't listed in this project's wage rates yet. Payroll is fixing this before the report is filed.");
  } else {
    if (r.status === "unregistered-apprentice")
      out.push(`Because no valid apprenticeship registration is on file, you must be paid the full ${w.classification} rate.`);
    out.push(
      `On this project, the law sets your minimum pay at ${fmt(r.requiredBase)}/hr in wages plus ${fmt(r.requiredFringe!)}/hr in benefits (${fmt(r.requiredBase + r.requiredFringe!)}/hr in total).`,
    );
    if (days) out.push(`On ${days}, more apprentices were on site than the program allows, so those hours must be paid at the full rate.`);
    out.push(
      `You were paid ${fmt(w.basePaid)}/hr in wages${w.cashInLieuPerHour ? `, ${fmt(w.cashInLieuPerHour)}/hr in cash instead of benefits,` : ""} and ${fmt(fringeCredit)}/hr in benefits.`,
    );
    if (r.otHours > 0)
      out.push(`${n(r.otHours)} of your hours were over 40 and must be paid at least ${fmt(1.5 * basic)}/hr. You were paid ${fmt(w.otRatePaid)}/hr.`);
    out.push(
      r.owed > 0
        ? `Our check found you are owed ${fmt(r.owed)} more for this week. Your employer's payroll team is reviewing the correction.`
        : "Your pay meets this project's prevailing wage requirements.",
    );
  }
  out.push(`Gross pay on this project: ${fmt(w.grossReported)}. Deductions: ${fmt(w.deductions)}. Net: ${fmt(net)}.`);
  out.push("Questions? Ask your payroll contact. You can also call the U.S. Department of Labor's Wage and Hour Division at 1-866-487-9243.");
  return out;
}

export function workerOwedSummary(result: CheckResult) {
  return result.workers.filter((r) => r.owed > 0).map((r) => ({ name: r.worker.name, owed: r.owed }));
}

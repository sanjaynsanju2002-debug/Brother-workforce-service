/** Shared WhatsApp click-to-send helpers (no API keys — free deep links). */

export function waLink(number: string, message: string): string {
  const digits = (number || "").replace(/\D/g, "");
  const withCode = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCode}?text=${encodeURIComponent(message)}`;
}

export function workerMessage(name: string): string {
  return `Hello ${name}, this is Brothers Workforce Solutions regarding your job application. We would like to discuss a suitable opportunity with you.`;
}

export function companyMessage(company: string, role: string, count: string): string {
  return `Hello, this is Brothers Workforce Solutions. Thank you for your manpower requirement for ${company} (${count} x ${role}). We would like to discuss the deployment plan with you.`;
}

export function jobAlertMessage(
  name: string,
  job: { title: string; location: string; salary?: string | null; shift?: string | null },
): string {
  const bits = [
    `Hello ${name}, Brothers Workforce Solutions has a new opening that matches your profile.`,
    `Role: ${job.title}`,
    `Location: ${job.location}`,
  ];
  if (job.salary) bits.push(`Salary: ${job.salary}`);
  if (job.shift) bits.push(`Shift: ${job.shift}`);
  bits.push("Reply YES if you are interested and we will share the details.");
  return bits.join("\n");
}

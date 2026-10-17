import { translateText, useSiteLanguage } from "@/lib/language";
import { Mail, MapPin, Phone } from "lucide-react";
import { BRAND } from "@/lib/brand";

export default function Footer() {
  useSiteLanguage();
  return (
    <footer className="bg-[#091322] text-slate-300" data-testid="site-footer">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-3">
        <div>
          <img src={BRAND.logo} alt={translateText("Brothers Workforce Solutions")} className="mb-4 h-16 w-16 object-contain" />
          <p className="font-[family-name:var(--font-heading)] text-lg font-bold text-white">{translateText("BROTHERS ")}<span className="text-[#FB923C]">{translateText("WORKFORCE")}</span>{translateText(" SOLUTIONS")}</p>
          <p className="mt-1 text-sm text-slate-400">{translateText(BRAND.tagline)}</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">{translateText("A trusted manpower supply partner providing skilled, semi-skilled and general workforce solutions to factories and businesses across Karnataka.")}</p>
        </div>

        <div>
          <p className="bws-overline mb-4 text-[#FB923C]">{translateText("Quick Links")}</p>
          <ul className="space-y-2 text-sm">
            {[
              ["Services", "/#services"],
              ["Industries", "/#industries"],
              ["Compliance", "/#compliance"],
              ["Job Listings", "/#jobs"],
              ["Worker Registration", "/#worker-registration"],
              ["Manpower Request", "/#manpower-request"],
              ["Privacy Notice", "/privacy"],
            ].map(([label, href]) => (
              <li key={href}>
                <a href={href} className="transition-colors hover:text-[#FB923C]">
                  {translateText(label)}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="bws-overline mb-4 text-[#FB923C]">{translateText("Contact")}</p>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#FB923C]" /> {translateText(BRAND.officeAddress || BRAND.location)}
            </li>
            <li className="flex gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#FB923C]" />
              <a href={`tel:${BRAND.phoneRaw}`} className="hover:text-[#FB923C]">
                {BRAND.phone}
              </a>
            </li>
            <li className="flex gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#FB923C]" />
              <a href={`mailto:${BRAND.email}`} className="break-all hover:text-[#FB923C]">
                {BRAND.email}
              </a>
            </li>
          </ul>
          <p className="mt-4 text-xs text-slate-500">{translateText("GST No: ")}{BRAND.gst}</p>
          <p className="mt-1 text-xs text-slate-500">{translateText("Licensed Labour Contractor · Licence details on request")}</p>
          <p className="mt-1 text-xs text-slate-500">{translateText("Establishment Reg. No: ")}{translateText(BRAND.establishmentRegistrationNumber)}</p>
        </div>
      </div>
      <div className="border-t border-slate-800 py-5 text-center text-xs text-slate-500">
        © {translateText(new Date().getFullYear())} {translateText(BRAND.name)}{translateText(". All rights reserved.")}</div>
    </footer>
  );
}

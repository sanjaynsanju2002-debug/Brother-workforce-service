import { translateText, useSiteLanguage } from "@/lib/language";
import { Link } from "react-router-dom";
import { BRAND } from "@/lib/brand";
import Footer from "@/components/site/Footer";
import LanguageSelector from "@/components/site/LanguageSelector";
import { usePageTitle } from "@/lib/language";

export default function Privacy() {
  useSiteLanguage();
  usePageTitle(`Privacy Notice | ${BRAND.name}`);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F2444]">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Link to="/" className="flex items-center gap-3 font-semibold"><img src={BRAND.logo} alt="" className="h-10 w-10 object-contain" />{translateText(BRAND.name)}</Link>
          <Link to="/" className="text-sm font-semibold text-[#C2410C]">{translateText("Back to website")}</Link>
          <LanguageSelector />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="text-xs font-bold uppercase tracking-widest text-[#C2410C]">{translateText("Your information")}</p>
        <h1 className="mt-2 text-4xl font-bold">{translateText("Privacy Notice")}</h1>
        <p className="mt-3 text-sm text-slate-500">{translateText("Updated 12 October 2026")}</p>
        <div className="mt-8 space-y-8 rounded-xl border border-slate-200 bg-white p-6 leading-relaxed text-slate-700 sm:p-10">
          <section>
            <h2 className="text-xl font-semibold text-[#0F2444]">{translateText("Information you give us")}</h2>
            <p className="mt-2">{translateText("For job registration, we collect the details you enter, such as your name, mobile number, location, skills, experience, and any optional resume. When you apply for a listed job, we also record which job you chose. For manpower enquiries, we collect company and contact details along with the requirement you submit.")}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-[#0F2444]">{translateText("How we use it")}</h2>
            <p className="mt-2">{translateText("Our workforce team reviews applications, contacts candidates about relevant opportunities, and responds to employer enquiries. If you agree when applying, the team may share a relevant candidate profile with an employer for recruitment. Submitting a profile does not guarantee placement.")}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-[#0F2444]">{translateText("Website activity")}</h2>
            <p className="mt-2">{translateText("We count anonymous website visits to understand activity. A browser session flag prevents repeat counts in the same session. Admin sign-in uses a secure session cookie. The visit counter does not store your name or phone number.")}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-[#0F2444]">{translateText("Storage and removal")}</h2>
            <p className="mt-2">{translateText("Applications, enquiries, and optional resumes are kept in the service's records for our team to manage recruitment and enquiries. There is currently no automatic expiry for these records. You can ask us to correct or remove your details by emailing ")}<a className="font-medium text-[#C2410C] underline" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>{translateText(". Our admin team can remove an application and its stored resume.")}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-[#0F2444]">{translateText("Contact")}</h2>
            <p className="mt-2">{translateText("Brothers Workforce Solutions, ")}{translateText(BRAND.location)}{translateText(". Email ")}<a className="font-medium text-[#C2410C] underline" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>{translateText(" or call ")}<a className="font-medium text-[#C2410C] underline" href={`tel:${BRAND.phoneRaw}`}>{BRAND.phone}</a>.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

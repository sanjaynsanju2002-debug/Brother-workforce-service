import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Award,
  Box,
  Briefcase,
  Building2,
  Car,
  Cpu,
  Factory,
  FileBadge,
  Handshake,
  MapPin,
  Mail,
  MessageSquare,
  PackageCheck,
  PhoneCall,
  PiggyBank,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
  Utensils,
  Wrench,
} from "lucide-react";
import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";
import WorkerForm from "@/components/site/WorkerForm";
import CompanyForm from "@/components/site/CompanyForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiGet } from "@/lib/api";
import { BRAND, IMAGES } from "@/lib/brand";
import { trackVisit } from "@/lib/track";
import type { Client, Job } from "@/types";

const TRUST = [
  { icon: FileBadge, title: "Licensed Labour Contractor", desc: "Authorized contract labour operations" },
  { icon: ReceiptText, title: "GST Registered", desc: "Official tax invoicing & compliance" },
  { icon: ShieldCheck, title: "ESIC Covered Employees", desc: "Employee welfare compliance" },
  { icon: PiggyBank, title: "EPF Services", desc: "Provident fund enrolment & remittance" },
  { icon: Award, title: "MSME Registered", desc: "Registered under MSME framework" },
];

const SERVICES = [
  {
    title: "Skilled Workforce",
    tag: "Technical & Precision",
    items: ["Machine Operators", "Technicians", "Electricians", "Welders", "Fitters", "Experienced industrial workers"],
    icon: Wrench,
  },
  {
    title: "Semi-Skilled Workforce",
    tag: "Operational Execution",
    items: ["Production operators", "Assembly workers", "Quality support workers", "Warehouse associates", "Packaging operators"],
    icon: PackageCheck,
  },
  {
    title: "General Workforce",
    tag: "Plant & Material Operations",
    items: ["Helpers", "Packers", "Loaders", "Material handling workers", "Production assistants"],
    icon: Users,
  },
  {
    title: "Factory Workforce Solutions",
    tag: "Turnkey Line Staffing",
    items: ["Manufacturing units", "Production lines", "Industrial operations"],
    icon: Factory,
  },
  {
    title: "Warehouse & Logistics Workforce",
    tag: "Supply Chain & Fulfilment",
    items: ["Picking", "Packing", "Sorting", "Loading", "Dispatch operations"],
    icon: Truck,
  },
];

const INDUSTRY_CARDS = [
  { name: "Manufacturing", icon: Factory },
  { name: "Automobile", icon: Car },
  { name: "Engineering", icon: Wrench },
  { name: "Electronics", icon: Cpu },
  { name: "Warehouse & Logistics", icon: Truck },
  { name: "FMCG", icon: ShoppingBag },
  { name: "Food Processing", icon: Utensils },
  { name: "Packaging", icon: Box },
  { name: "Industrial Operations", icon: Activity },
];

const COMPLIANCE = [
  { title: "Licensed Labour Contractor", desc: "Authorized contract labour operations.", icon: FileBadge },
  { title: "GST Registered", desc: `GST No: ${BRAND.gst}`, icon: ReceiptText },
  { title: "ESIC Employee Coverage", desc: "Employee welfare supported through ESIC compliance.", icon: ShieldCheck },

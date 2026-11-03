import Link from "next/link";
import AuthCard from "@/components/AuthCard";

export default function NotFound() {
  return (
    <main className="auth">
      <AuthCard title="That page isn't here" lede="The link may be wrong, or the page has moved.">
        <Link className="btn btn-primary btn-block" href="/">
          Go to Home
        </Link>
      </AuthCard>
    </main>
  );
}

import Link from "next/link";

export default function DocNotFound() {
  return (
    <div className="px-6 md:px-8 lg:px-12 py-12 md:py-16">
      <div className="max-w-2xl mx-auto text-center">
        <div className="w-16 h-16 bg-neo-pink/20 border-2 border-black shadow-neo mx-auto mb-6 flex items-center justify-center">
          <span className="text-3xl font-heading font-bold">?</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-heading font-bold text-neo-dark mb-4">
          Page Not Found
        </h1>
        <p className="text-lg text-neo-dark/70 mb-8">
          The documentation page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/docs" className="neo-btn-primary">
            Back to Docs
          </Link>
          <Link href="/" className="neo-btn-secondary">
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}

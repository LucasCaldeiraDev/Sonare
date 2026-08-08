type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  /** Adapts text colors for the rare light bands. */
  onLight?: boolean;
};

export function SectionHeading({ eyebrow, title, description, onLight = false }: SectionHeadingProps) {
  return (
    <div className="mb-12 max-w-2xl lg:mb-16">
      <p
        className={`mb-4 text-[0.72rem] font-bold uppercase tracking-[0.24em] ${
          onLight ? "text-sonare-gold-deep" : "text-sonare-gold"
        }`}
      >
        {eyebrow}
      </p>
      <h2
        className={`font-grandis text-3xl font-medium leading-tight lg:text-4xl ${
          onLight ? "text-sonare-black" : "text-sonare-white"
        }`}
      >
        {title}
      </h2>
      {description && (
        <p className={`mt-5 text-base leading-relaxed lg:text-lg ${onLight ? "text-black/65" : "text-sonare-silver"}`}>
          {description}
        </p>
      )}
    </div>
  );
}

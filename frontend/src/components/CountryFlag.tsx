interface CountryFlagProps {
  countryCode?: string;
  className?: string;
}

export function CountryFlag({
  countryCode,
  className = "h-5 w-8 rounded-md border-0 object-cover",
}: CountryFlagProps) {
  if (!countryCode) return null;

  const flagUrl = `http://purecatamphetamine.github.io/country-flag-icons/3x2/${countryCode.toUpperCase()}.svg`;

  return (
    <img
      src={flagUrl}
      alt={countryCode}
      title={countryCode}
      className={className}
      loading="lazy"
      onError={(e) => {
        // Fallback to text if flag fails to load
        const target = e.target as HTMLImageElement;
        target.style.display = 'none';
      }}
    />
  );
}

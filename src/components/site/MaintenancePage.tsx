import ThemeProvider from '@/components/ThemeProvider'

// Bakım modu açıkken ziyaretçilerin gördüğü sayfa (admin siteyi normal görür)
export default function MaintenancePage({ profile }: { profile: Record<string, any> }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-5" style={{ backgroundColor: 'var(--color-background)' }}>
      <ThemeProvider
        theme={{
          primaryColor: profile.primaryColor,
          accentColor: profile.accentColor,
          backgroundColor: profile.backgroundColor,
          cardColor: profile.cardColor,
          textColor: profile.textColor,
          buttonStyle: profile.buttonStyle,
          fontFamily: profile.fontFamily,
          borderRadius: profile.borderRadius,
          animationSpeed: profile.animationSpeed,
        }}
      />
      <div className="site-card w-full max-w-md px-8 py-10 text-center text-dynamic-text">
        {profile.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.imageUrl} alt="" className="w-20 h-20 rounded-full object-cover mx-auto mb-4" />
        )}
        <h1 className="text-2xl font-semibold">{profile.name}</h1>
        <p className="mt-3 opacity-80 whitespace-pre-line leading-relaxed">
          {profile.maintenanceMessage || 'Sayfa kısa bir süreliğine bakımda. Birazdan tekrar uğrayın.'}
        </p>
      </div>
    </main>
  )
}

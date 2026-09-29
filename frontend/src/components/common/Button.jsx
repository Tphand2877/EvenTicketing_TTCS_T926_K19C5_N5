/**
 * Reusable Button component
 *
 * Variants: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
 * Sizes: 'sm' | 'md' | 'lg'
 */
const variantClasses = {
  primary:
    'bg-gradient-to-r from-violet-600 via-pink-600 to-orange-500 ' +
    'hover:from-violet-700 hover:via-pink-700 hover:to-orange-600 ' +
    'text-white shadow-lg shadow-pink-200 hover:shadow-pink-300',
  secondary:
    'bg-gray-100 hover:bg-gray-200 text-gray-800',
  outline:
    'border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-gray-700',
  ghost:
    'bg-transparent hover:bg-gray-100 text-gray-700',
  danger:
    'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200',
}

const sizeClasses = {
  sm:  'py-2 px-4 text-xs rounded-lg',
  md:  'py-2.5 px-5 text-sm rounded-xl',
  lg:  'py-3 px-6 text-sm rounded-xl',
  xl:  'py-3.5 px-8 text-base rounded-xl',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'lg',
  fullWidth = false,
  disabled = false,
  loading = false,
  type = 'button',
  onClick,
  className = '',
  ...rest
}) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold ' +
    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-400 ' +
    'transition-all duration-200 transform hover:scale-[1.01] ' +
    'disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none'

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={[
        base,
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}

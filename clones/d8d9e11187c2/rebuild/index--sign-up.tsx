export default function Page() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40"></button>
      <div role="dialog" aria-modal="true" aria-labelledby="signup-title" className="relative flex w-full max-w-[480px] flex-col items-center gap-6 overflow-hidden rounded-3xl bg-white p-6">
        <span aria-hidden="true" className="pointer-events-none absolute top-0 left-1/2 h-[100px] w-[480px] -translate-x-1/2 bg-gradient-to-b from-[rgba(255,115,0,0.24)] to-transparent"></span>
        
        <div className="relative flex size-10 items-center justify-center rounded-xl border border-[#D0D5DD] bg-white shadow-[0px_1px_1px_rgba(16,24,40,0.06),0px_1px_1.5px_rgba(16,24,40,0.1)]">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-5">
            <g fill="none" stroke="#080302" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"></circle>
              <path d="M4 20c0-4 3.582-7 8-7s8 3 8 7"></path>
            </g>
          </svg>
        </div>
        
        <div className="relative flex w-full flex-col items-center gap-1.5">
          <h2 id="signup-title" className="text-xl leading-[30px] font-semibold text-[#080302]">Create an account</h2>
          <p className="text-center text-base leading-6 text-[#666]">Fill in your details to get started.</p>
        </div>
        
        <form className="relative flex w-full flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-name" className="text-sm leading-5 font-semibold text-[#080302]">Full name</label>
            <input 
              id="signup-name" 
              type="text" 
              autoComplete="name" 
              placeholder="Jane Doe" 
              className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-base leading-6 text-[#080302] shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] placeholder:text-[#999] focus:outline-none focus:ring-2 disabled:bg-[#F3F3F3] border-[#D0D5DD] focus:border-[#FF7300] focus:ring-[rgba(255,115,0,0.2)]"
            />
          </div>
          
          <div className="flex flex-col gap-1.5">
            <p className="text-sm leading-5 font-semibold text-[#080302]">Gender</p>
            <div className="flex gap-3">
              <button 
                type="button" 
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-base leading-6 font-medium transition-colors disabled:opacity-60 border-[#D0D5DD] bg-white text-[#666] hover:bg-[#F9F9F9]"
              >
                <span className="size-4 rounded-full border-2 transition-colors border-[#D0D5DD] bg-white"></span>
                Male
              </button>
              <button 
                type="button" 
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-base leading-6 font-medium transition-colors disabled:opacity-60 border-[#D0D5DD] bg-white text-[#666] hover:bg-[#F9F9F9]"
              >
                <span className="size-4 rounded-full border-2 transition-colors border-[#D0D5DD] bg-white"></span>
                Female
              </button>
            </div>
          </div>
          
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-email" className="text-sm leading-5 font-semibold text-[#080302]">Email address</label>
            <input 
              id="signup-email" 
              type="email" 
              autoComplete="email" 
              placeholder="you@example.com" 
              className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-base leading-6 text-[#080302] shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] placeholder:text-[#999] focus:outline-none focus:ring-2 disabled:bg-[#F3F3F3] border-[#D0D5DD] focus:border-[#FF7300] focus:ring-[rgba(255,115,0,0.2)]"
            />
          </div>
          
          <button 
            type="submit" 
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#FF7300] bg-[#FF7300] px-4.5 py-2.5 text-base leading-6 font-semibold text-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] transition-colors hover:bg-[#e66800] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Create account
          </button>
          
          <p className="text-center text-sm leading-5 text-[#666]">
            Already have an account? 
            <button type="button" className="font-semibold text-[#FF7300] hover:underline">Log in</button>
          </p>
        </form>
      </div>
    </div>
  );
}
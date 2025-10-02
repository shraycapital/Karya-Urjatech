import React from 'react';

const MarketTab = ({ currentUser, t }) => {
  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 text-center">
        {/* Market Icon */}
        <div className="w-16 h-16 bg-gradient-to-br from-brand-500 to-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="32" 
            height="32" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="white" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13v6a2 2 0 002 2h6a2 2 0 002-2v-6M9 19h6" />
          </svg>
        </div>
        
        {/* Coming Soon Title */}
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {t('marketComingSoon') || 'Market Coming Soon!'}
        </h2>
        
        {/* Description */}
        <p className="text-slate-600 mb-4 leading-relaxed">
          {t('marketDescription') || 'Exciting things are coming! Soon you\'ll be able to spend your earned points on rewards, benefits, and exclusive items.'}
        </p>
        
        {/* Current Points Display */}
        <div className="bg-gradient-to-r from-brand-50 to-brand-100 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-center mb-2">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="text-brand-600 mr-2"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span className="text-sm font-medium text-brand-700">
              {t('yourCurrentPoints') || 'Your Current Points'}
            </span>
          </div>
          <div className="text-2xl font-bold text-brand-800">
            {currentUser?.totalPoints || 0}
          </div>
        </div>
        
        {/* Features Preview */}
        <div className="text-left">
          <h3 className="text-lg font-semibold text-slate-900 mb-3 text-center">
            {t('marketFeatures') || 'What to Expect'}
          </h3>
          <div className="space-y-3">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <path d="M22 4L12 14.01l-3-3" />
                </svg>
              </div>
              <span className="text-slate-700">
                {t('marketFeature1') || 'Redeem points for gift cards and vouchers'}
              </span>
            </div>
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <path d="M22 4L12 14.01l-3-3" />
                </svg>
              </div>
              <span className="text-slate-700">
                {t('marketFeature2') || 'Get exclusive company merchandise'}
              </span>
            </div>
            <div className="flex items-center">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <path d="M22 4L12 14.01l-3-3" />
                </svg>
              </div>
              <span className="text-slate-700">
                {t('marketFeature3') || 'Purchase additional benefits and perks'}
              </span>
            </div>
            <div className="flex items-center">
              <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center mr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-600">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <path d="M22 4L12 14.01l-3-3" />
                </svg>
              </div>
              <span className="text-slate-700">
                {t('marketFeature4') || 'Special deals and limited-time offers'}
              </span>
            </div>
          </div>
        </div>
        
        {/* Call to Action */}
        <div className="mt-6 p-4 bg-slate-50 rounded-lg">
          <p className="text-sm text-slate-600 mb-2">
            {t('marketCallToAction') || 'Keep earning points by completing tasks to be ready when the market launches!'}
          </p>
          <div className="flex items-center justify-center text-xs text-slate-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            {t('marketStayTuned') || 'Stay tuned for updates!'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketTab;













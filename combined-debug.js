/**
 * Debug script to diagnose annotation loading issues
 * 
 * INSTRUCTIONS:
 * 1. Open your localhost page in Chrome (e.g. http://localhost:3002)
 * 2. Open DevTools Console (F12)
 * 3. Paste and run this script
 * 4. Look at the output to see what's failing
 */

(async function debugAnnotations() {


  // 1. Check if Pointa is loaded

  if (typeof window.pointa === 'undefined') {
    console.error('❌ Pointa is not loaded! Extension may not be injected.');
    return;
  }





  // 2. Check annotations array

  const annotations = window.pointa.annotations || [];

  if (annotations.length > 0) {

  }


  // 3. Check current URL

  const currentUrl = window.location.href;




  // 4. Try to load annotations from API

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getAnnotations',
      url: window.location.href
    });

    if (response.success) {

      if (response.annotations && response.annotations.length > 0) {

        response.annotations.slice(0, 3).forEach((a, i) => {

        });
      }
    } else {
      console.error('   - API Error:', response.error);
    }
  } catch (error) {
    console.error('   - Failed to call API:', error);
  }


  // 5. Check badges on page

  const badges = document.querySelectorAll('.pointa-badge');

  if (badges.length > 0) {

    badges.forEach((badge, i) => {
      const id = badge.getAttribute('data-annotation-id');

    });
  }


  // 6. Check if sidebar is open

  const sidebar = document.querySelector('#pointa-sidebar');
  if (sidebar) {

    const annotationItems = sidebar.querySelectorAll('.sidebar-annotation-item');

  } else {

  }


  // 7. Try to manually trigger badge display

  if (window.pointa.badgeManager) {
    const foundCount = window.pointa.badgeManager.showExistingAnnotations();

  } else {
    console.error('   - Badge manager not available');
  }


  // 8. Summary

  if (annotations.length === 0) {
    console.warn('⚠️  NO ANNOTATIONS IN MEMORY');




  } else if (badges.length === 0) {
    console.warn('⚠️  ANNOTATIONS IN MEMORY BUT NO BADGES VISIBLE');




  } else {

  }


})();

/**
 * Check why a specific annotation isn't displaying
 * Run this in the browser console on the page where the annotation should appear
 */

(async function checkAnnotation() {
  const annotationId = 'pointa_1764044249117_ctgqzektl';



  // 1. Check if Pointa is loaded
  if (!window.pointa) {
    console.error('❌ Pointa not loaded!');
    return;
  }

  // 2. Check if annotation is in memory
  const annotation = window.pointa.annotations.find((a) => a.id === annotationId);

  if (annotation) {



  } else {
    console.error('   ❌ Annotation NOT in memory!');


    await window.pointa.loadAnnotations();
    const reloaded = window.pointa.annotations.find((a) => a.id === annotationId);
    if (reloaded) {

      return checkAnnotation(); // Re-run check
    }
  }


  // 3. Try to find the element using the selector

  if (annotation) {
    const selector = annotation.selector;


    try {
      const element = document.querySelector(selector);


      if (!element) {
        console.error('   ❌ SELECTOR DOES NOT MATCH ANY ELEMENT!');








        // Check if it's a data-pointa-id selector
        if (selector.includes('data-pointa-id')) {








        }

        // Try to find similar elements


        const tag = annotation.element_context?.tag;
        const classes = annotation.element_context?.classes || [];
        const text = annotation.element_context?.text?.substring(0, 50);

        if (tag) {
          const similarElements = document.querySelectorAll(tag);


          if (classes.length > 0) {
            const classSelector = tag + '.' + classes.join('.');
            const withClasses = document.querySelectorAll(classSelector);


            if (text && withClasses.length > 0) {
              const matchingText = Array.from(withClasses).filter((el) =>
              el.textContent.includes(text)
              );


              if (matchingText.length > 0) {




              }
            }
          }
        }
      } else {




      }
    } catch (error) {
      console.error('   ❌ Error testing selector:', error.message);
    }
  }


  // 4. Check if badge exists

  const badge = document.querySelector(`[data-annotation-id="${annotationId}"]`);

  if (!badge) {
    console.error('   ❌ No badge found!');

  }


  // 5. Try to manually show the badge

  if (annotation) {
    const element = window.pointa.findElementBySelector(annotation);
    if (element) {


      window.pointa.badgeManager.showExistingAnnotations();

    } else {
      console.error('   ❌ Pointa element finder also cannot find element');

    }
  }



  if (!annotation) {
    console.error('❌ Annotation not loaded in memory');
  } else if (!document.querySelector(annotation.selector)) {
    console.error('❌ Element selector does not match anything on page');

  } else if (!badge) {
    console.error('❌ Element exists but badge was not created');

  } else {

  }
})();

🍰 THE CAKE

- [x] !!!!!!!! Check the discussion with Cursor on switching MCP to "npx" command rather and how to handle all the edge cases - COMPLETED: Updated README.md, onboarding-overlay.js, and all documentation to use npx command approach. Architecture already supports it perfectly via stdio mode in cli.js.

- [x] Make the JSON reference much smaller (2k+ tokens each time is crazy) - keep it lean for context window and token efficiency
- [x] !!! Remove the delete annotation done by the MCP - Always a human who should validate it was done correctly !!! Add the done by AI flow with status from the MCP server when it did the work and then manual human touch where it clicks done (checkmark) to say it is done or ask for a further review again
- [x] Feat: Add Design mode where we can edit in real-time in the browser and write to JSON what needs to be done - get inspiration from here: https://x.com/pavitarsaini/status/1973862468138250739
  - [x] When we reload the page after saving a design mode annotation, the page should display as per the design mode edits made (right now it goes back to previous state) - I think it saves to JSON but then it does not reflect anymore when reloading the page. If we delete it then yes it is not there anymore and the page goes back to initial state but if there is a design mode annotation and edits created in real time and submitted - then it saves to JSON + it keeps the edit active on the page when we reload
  - [x] Given I created a design mode annotation, when I click the arrow or any other way to delete it, then the page should reflect that change without needing me to reload the page (is that possible technically?)
  - [x] How should the design annotations look inside of the extension popup? Right now it is just empty - I think we should keep it simple, just say "Design mode edit" with quick reference to what was changed (padding, font, etc)
  - [x] In Design mode, when I click on an existing design mode annotation it should open the design mode panel as before so we can edit further if we want to (right now it opens the regular annotation UI with "undefined" in it)
  - [x] Make it look much more like V0 with same options + proper native dropdowns
  - [x] Sanity check: is the data from design mode saved in JSON correctly for the AI to do a good job, is it clear enough - double check all elements of the design mode one by one
  - [x] What do to with components architecture??? How to handle that, won't the AI just edit that specific button?
  - [x] Improvement: ability to edit all components the same across the page? So you can see changes to all components? How to handle that case best in terms of UX/UI??? How to handle component based frameworks like React, Vue etc.
  - [x] IMPLEMENTATION COMPLETE: Design mode UI with scope selector - user can now choose what to edit!
  - [x] Design mode scope persistence: Changes persist correctly on page reload for all affected elements
  - [x] AI instruction clarity: Scope information clearly saved in JSON with explicit instructions
  - [x] Design mode: ensure all numbers changes have native dropdowns when clicked as for margins and paddings
  - [x] Design mode: if I hit arrows up or down on my keyboard in a number input then it increases or descreases that number
- [x] FEAT: in design mode, would it be possible to just drag and move an element to a new position, have it show in the page in real-time and then edit the JSON with the right info so the AI does it correctly.
- [x] Feat: bug reporting (requires a proper spec) - get inspiration from jam.dev (but lighter version)
- [x] Feat: performance audit (requires a proper spec)
- [x] Feat: Inspiration from any other website - select and it takes screenshot + any valuable Metadata and send to JSON for the model to get inspiration from - wait actually inspiration is unlikely to work by bulk so we don't want to add that to the JSON, we already have an MCP, how can we leverage it to get the inspiration fed into Cursor or else easily??? It will likely not be a bulk flow but rather a one time you find a great component, you select and it sends to the vibe coding tool to get inspiration. The user experience is basically: I am working on a new element, I want to feed inspiration to my AI coding tool easily, I switch to the browser, use pointa to select this element and hop it provides the inspiration right away... how to make that work beautifully and seamlessly for the user. 
- [x] FEAT: Add a proper onboarding flow on first extension install
- [x] EDIT: Does it make sense to also require to purge done annotations, I think we should replace the tabs with active aka waiting for AI and other tab as "to review" and once it is reviewed it just disappears entirely
- [x] What is this "capture screenshot" feature in the settings? Do we keep it? Do we remove it? is it used in our code logic right now? - RESOLVED: Removed entirely as the rich metadata (selectors, source mapping, parent chain, design mode) provides sufficient context for AI
- [x] Add a "send directly to Cursor" if the user does not want to do more than 1 annotation and want to edit directly??? - IMPLEMENTED: Copy to clipboard feature with three locations (sidebar, badges, bulk copy) that generates MCP-friendly prompts with annotation IDs
- [x] Add mention of the bug report and performance investigation in the onboarding flow as well
- [ ] Allow a proper interaction with the AI: if for instance the user asked a question in the annotation, then the AI is allowed add an answer back (would it required to add another add_comment to the MCP server actions? and then it would display as a comment answer for that specific annotation... recreating a sort of conversation between the human and the AI as on Figma)
- [ ] FEAT: add a recording mode: you just record your screen and highlight with your mouse around, we feed that to an LLM and you get auto-generated annotations ready for your LLM to fix in bulk (make that paying feature???) - could it be created as a separate Chrome extension doing just that?
- [ ] !!! FEAT add ability to add a screenshot of the element on which an annotation is being written (just one click button, saves the image and attach it to the annotation)

🍪 THE CRUMBS
- [x] Hitting "esc" on keyboard should leave the onboarding modal flow when we hit it 
- [x] BUG: when you edit an existing annotation, after that the delete button on the right on hover stop showing
- [x] BUG: sometimes i type an annotation, hit enter but even then the edit modal does not disappear, it stays and I have to reload the page for it to disappear even though the annotation seems to be saved already before
- [x] BUG: After saving a bug report or performance investigation report, the sidebar dropdown doesn't show the new report until page reload - FIXED: Added window.PointaSidebar assignment + immediate sidebar refresh after save
- [ ] Clean up any console logs used for the design mode debugging
- [x] When we click on an anchor and URL turns into #xxx I noticed the extension stops showing the annotations - this is wrong, we should still show them since they are on the page
- [x] REFACTOR: the content.js file is 5000+ lines - we need to break it down worth switching to TypeScript too or keep JS?
- [ ] How to make this extension code hard to copy for other developers? What are the options available?
- [x] Switching between "Active" and "To Review" tabs should not change what is displayed above, should still display the navigation dropdown
- [x] Right now if we are in annotation mode and we hover over the sidebar UI, it allows to annotate it which makes no sense - if we hover over the sidebar UI and it allows us to interact with it to change mode for instance - the annotation mode or design mode are not active anymore
- [ ] what are these server logs in the .pointa folder... do we want that???
- [x] the current positioning of the annotation badge on the page sometimes appear on top of the element (maybe some smart logic for displaying it when we are on the egdge - this is bad - we can display the annotation badge anywhere on the page but never on top of the area of the element selected)
- [x] we should make sure that the mark_annotation_for_review is mark_annotations_for_review and can take just one annotation or multiple ones if we handled multiples ones - this way the MCP interaction in the AI coding tool isn't one tool call per annotation but one big tool call for all of them - it cleans up the user experience
- [ ] EDGE case: right now we don't display annotations if the element on the page was deleted - we need to handle that case more gracefully - I would suggest we display it on the page anyway maybe as close nearby from where it used to be (if easy to implement) and the annotation clearly states also on the UI that the element annotated was deleted so it is clear for the user - also right now I saw an example where we had two buttons next to each other, I selected the right one, asked to remove and once it was removed our extension would assign this annotation to the other button that is still there - maybe our selection logic for the element on the page isn't fully bullet proof yet - figure out why
- [ ] as soon as we click an annotation as done - it should not display it anymore on the page (right now it still does after we click done, we still have to escape the annotation if it was selected)
- [ ] THe current count of number of annotations on the top of the extension sidebar below the name "Pointa" seems off, I had zero annotations in my JSON but it said 27 annotations - I suspect we read from local storage or something like that...
- [ ] Review onboarding flow to remove all the annoying scroll on the page + make it look proper sleek with less text
- [ ] UI glitch with the dropdown
- [ ] With the new API / JSON only data flow, when we click the cross on a badge annotation, it does the work (deletes the annotation) but it does not update the sidebar UI unless we reload the page - the delete in the sidebar does automatically update so we need the cross on the badge to have the same logic where it also reloads the sidebar UI without requiring a page reload
- [ ] In inspiration mode: when we are selecting an element on the page it is supposed to display lines on the screen showing the area we are selecting for, but that does not seem to display right now, what is preventing it right now?



🍒 CHERRY ON THE CAKE
- [ ] When clicking "Ask AI" - it would be great to count the total token count for each annotation or bug reports you select so that the user knows the size of the context window they are going to push to their AI coding tool - with a small bar telling them if it's small, medium or large context window so they know as they select different annotations / bug reports if they should unselect some to reduce the context window. Maybe we should have a small tooltip to say "we recommend keeping it to xxx tokens" to limit the context window
- [ ] small UI improvement, UX UI. If I hover over an annotation badge on the page, then it should show a slight grey background slightly. A slightly grey background of that reference in the sidebar. And then if I click it meaning that badge on my page then it should in the sidebar that specific annotation reference should be showing a selection like select mode. It should show that it's been selected. So the background should have the state of hover and then the state of selected very similar to how Figma does it. Yeah, do that.
- [ ] Add in the sidebar info about total number of annotations across entire website (same URL base) and ability to click a dropdown and switch to the pages with other annotations easily
- [ ] When looking at a page, have a toggle that allow to see the page without the design mode edits (it removes them so you can see the original page before the edits)
- [ ] Design mode: when displaying a design mode annotation that has been addressed by the AI (aka in review), it should display a summary in natural language of the changes requested, not display the whole edit mode UI again, if the user requests another edit though, then it displays the design mode UI again for the user to make the changes
- [x] Gap (Flexbox/Grid) - it is a text input right now, does not make sense, what to put instead? what choices?
- [ ] How to make the transition from editing in the browser extension to CUrsor or else (extension to MCP) smoother and more clear for the user? Like make it clear what they have to do depending on the tool they use. 
- [ ] In design mode: if changing background color but want to cancel there should be a cross to cancel the changes, right now we stay stuck with it and are forced to continue applying a background color
- [x] Design mode: allow the user to drag the design mode modal across the screen to move it around if they want to so they can see other parts of the screen better - implement it in a simple way to avoid glitches and bugs
- [ ] Design mode: add a rest option to cancel the changes made before submit if any
- [ ] Design mode: make sure the UI does not display on top of the element being edited otherwise we can't see the changes made in real-time
- [ ] UX/UI: make all dropdowns in the design mode native looking, not system
- [ ] UX/UI: add the "submit" button in design mode as sticky at the bottom so it is clear it is there, rest is scrollable but submit is always visible
- [x] UX/UI: make annotation vs design mode be just two small squares (as done exactly in Tether extension) rather than the two tabs + click we have right now in the popup.
- [ ] How to handle edits between white mode and dark mode? How do we make sure annotations take that into account?
- [ ] Allow user to mark any annotation as done manually on top
- [ ] After selecting an element on the page then like on V0 just have a little indicator of what it is (div, section, etc.) on the top left - and when you click it has a dropdown to ask "copy code" or "delete element" or "go to code" (it goes to code in the frontend by opening the elements tap of the browser)
- [x] When clicking on any annotation from the popup / sidebar navigation it redirects to the correct place exactly and with same state as if you had clicked on it (same behavior as Figma)
- [ ] Make the UI on hover on an annotation more polished (copy Figma UI on this) + make sure if the text is long then it has a max fixed width (right now it extends too much as long width)
- [x] Move the extension menu to sidebar (similar to Figma) rather than how it is now (pop over on top) - DECISION: Pure sidebar that resizes page content (not overlay, not hybrid)
- [ ] Change the annotation icon (looks old), make it look sleek somehow 
- [ ] When hovering on an annotation, right now it displays the highlight in two steps (thin then thick), it's weird remove, it should behave just like Figma
- [ ] Add a delete option in the UI of the annotation after clicking on it so can also delete from there easily
- [x] Add a dropdown menu to easily navigate between different pages (see how Figma does it) where when you click a page it only shows the annotations for that URL (also include any annotations on URLs with # anchor)
- [ ] Edge cases on UI:
  - [x] How to handle 2 comments on the same component? Make sure they show next to each other, not on top of each other as of right now
  - [x] full-width element: if element selected is full width, where does the annotation icon go?
  - [ ] What happens if the annotation was about removing an element for instance - since we removed it, then the annotation badge does not show anymore on the screen... what makes most sense for the user? What should we do?    


- [ ] Clean Up the ReadMe
- [x] Remove references to pointas and turn to Pointa
- [ ] Check further all references to `pointa` in various code logic and switch to pointa to remove all traces as much as possible
- [ ] Turn name of MCP server visible in Cursor or other tools as pointa, not pointa anymore

- [ ] Remove all use of confirmation modals from the browser - make them native to the UI (deletion modal or when not on a localhost or others - scan the repo for those)
- [ ] Change UI of the popover entirely to make it look like Pointa fully

- [ ] Right now the MCP server ask if we want to mark the annotations as done but it should not ask - it should just do it at the end of the task - how to enforce that?

- [ ] Add voice input (using the browser or local model running in the extension??? What is the best approach???)
import React, { useState, useEffect, useRef } from 'react';
import { ChatUser } from '@/api/entities';
import { Menu } from '@/api/entities';
import { Client } from '@/api/entities';
import { User } from '@/api/entities';
import { InvokeLLM, UploadFile } from '@/api/integrations';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image as ImageIcon, Send, Loader2, MessageSquare, InfoIcon, RefreshCw, Users } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Chat() {
  const { language, translations } = useLanguage();
  const [selectedChat, setSelectedChat] = useState(null);
  const [message, setMessage] = useState('');
  const [client, setClient] = useState(null);
  const [selectedClientUserCode, setSelectedClientUserCode] = useState(null);
  const [availableClients, setAvailableClients] = useState([]);
  const [mealPlanData, setMealPlanData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(true);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const [imageFile, setImageFile] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const toBase64 = file =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result.split(',')[1]);
    });
  


  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  useEffect(() => {
    if (selectedClientUserCode) {
      loadClientData(selectedClientUserCode);
    }
  }, [selectedClientUserCode]);

  useEffect(() => {
    scrollToBottom();
  }, [selectedChat?.messages]);

  const handleClientSelect = (userCode) => {
    setSelectedClientUserCode(userCode);
    setSelectedChat(null); // Reset chat when selecting new client
  };

  const loadData = async () => {
    setIsFetchingData(true);
    setError(null);
    
    try {
      console.log("Loading available clients from Supabase...");
      
      // Load all available clients from chat_users table
      const clients = await ChatUser.list();
      setAvailableClients(clients);
      
      console.log("Available clients loaded:", clients);
      
    } catch (error) {
      console.error("Error loading clients:", error);
      setError(translations.failedToLoadClients);
    } finally {
      setIsFetchingData(false);
    }
  };

  const loadClientData = async (userCode) => {
    if (!userCode) return;
    
    setIsFetchingData(true);
    setError(null);
    
    try {
      console.log("Loading client data for user_code:", userCode);
      
      // Get client data from chat_users table
      const clientData = await ChatUser.getByUserCode(userCode);
      setClient(clientData);
      
      // Get meal plan data from meal_plans_and_schemas table
      let mealPlan = null;
      try {
        mealPlan = await ChatUser.getMealPlanByUserCode(userCode);
        setMealPlanData(mealPlan);
      } catch (mealPlanError) {
        console.warn('No meal plan found for user:', userCode, mealPlanError);
        setMealPlanData(null);
      }
      
      console.log("Client data loaded:", clientData);
      console.log("Meal plan data loaded:", mealPlan);
      
      // Create a new temporary chat for this client (in memory only)
      const newChat = {
        id: `temp-${userCode}-${Date.now()}`,
        user_code: userCode,
        messages: []
      };
      setSelectedChat(newChat);
      console.log("Created temporary chat for user:", userCode);
    } catch (error) {
      console.error("Error loading client data:", error);
      setError(translations.failedToLoadClientData);
    } finally {
      setIsFetchingData(false);
    }
  };

  const handleSend = async () => {
    if ((!message.trim() && !imageFile) || !client) return;

    setIsLoading(true);
    try {
      // Create the user message object
      let userMessage = { role: 'user', content: message };

      let base64Image = null;
      // Handle image upload if selected
      if (imageFile instanceof File) {
        try {
          base64Image = await toBase64(imageFile);
          userMessage.image_url = `data:image/jpeg;base64,${base64Image}`;
        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
          setError(translations.failedToUpload);
          setIsLoading(false);
          return;
        }
      }

      // Update chat with user message
      const currentMessages = selectedChat?.messages || [];
      const updatedMessages = [...currentMessages, userMessage];

      const chatHistoryForPrompt = updatedMessages
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join('\n');

      // Prepare comprehensive client profile for AI context
      const clientProfile = {
        name: client.full_name,
        user_code: client.user_code,
        // Personal information
        ...(client.age && { age: client.age }),
        ...(client.date_of_birth && { date_of_birth: client.date_of_birth }),
        ...(client.gender && { gender: client.gender }),
        ...(client.weight_kg && { weight_kg: client.weight_kg }),
        ...(client.height_cm && { height_cm: client.height_cm }),
        ...(client.user_language && { user_language: client.user_language }),
        
        // Health and dietary information
        ...(client.food_allergies && { food_allergies: client.food_allergies }),
        ...(client.food_limitations && { food_limitations: client.food_limitations }),
        ...(client.Activity_level && { activity_level: client.Activity_level }),
        ...(client.goal && { goal: client.goal }),
        
        // Nutrition targets and preferences
        ...(client.dailyTotalCalories && { daily_total_calories: client.dailyTotalCalories }),
        ...(client.number_of_meals && { number_of_meals: client.number_of_meals }),
        ...(client.macros && { macros: client.macros }),
        ...(client.client_preference && { client_preference: client.client_preference }),
        ...(client.recommendations && { recommendations: client.recommendations }),
        
        // Legacy fields for backward compatibility
        ...(client.height && { height: client.height }),
        ...(client.weight && { weight: client.weight }),
        ...(client.activity_level && { activity_level: client.activity_level })
      };

      // Log comprehensive client profile for debugging
      console.log('🧠 Comprehensive client profile being sent to LLM:', JSON.stringify(clientProfile, null, 2));

      // Prepare meal plan context with detailed meal information
      const mealPlanContext = mealPlanData ? {
        meal_plan: mealPlanData.meal_plan,
        daily_total_calories: mealPlanData.daily_total_calories,
        macros_target: mealPlanData.macros_target,
        recommendations: mealPlanData.recommendations,
        dietary_restrictions: mealPlanData.dietary_restrictions,
        // Extract detailed meal information for better AI responses
        meals: mealPlanData.meal_plan?.meals || [],
        totals: mealPlanData.meal_plan?.totals || {},
        note: mealPlanData.meal_plan?.note || ''
      } : null;

      // Prepare AI prompt
      let aiPrompt;
      const instruction = `You are a professional and friendly nutrition coach for BetterChoice.
Your response must be in natural, conversational language. DO NOT output JSON, code, or markdown.
Address the client by their first name: ${client.full_name.split(' ')[0]}.

IMPORTANT: You have access to the client's current meal plan. You can answer detailed questions about their specific meals, ingredients, nutrition values, and provide personalized advice based on their actual meal plan.

Here is the comprehensive context for your response:

CLIENT PROFILE:
${JSON.stringify(clientProfile, null, 2)}

DIETARY CONSIDERATIONS:
${clientProfile.food_allergies ? `- Food Allergies: ${Array.isArray(clientProfile.food_allergies) ? clientProfile.food_allergies.join(', ') : clientProfile.food_allergies}` : '- No known food allergies'}
${clientProfile.food_limitations ? `- Food Limitations: ${Array.isArray(clientProfile.food_limitations) ? clientProfile.food_limitations.join(', ') : clientProfile.food_limitations}` : '- No specific food limitations'}
${clientProfile.activity_level ? `- Activity Level: ${clientProfile.activity_level}` : ''}
${clientProfile.goal ? `- Health Goal: ${clientProfile.goal}` : ''}

NUTRITION TARGETS:
${clientProfile.daily_total_calories ? `- Daily Calories: ${clientProfile.daily_total_calories} kcal` : ''}
${clientProfile.number_of_meals ? `- Number of Meals: ${clientProfile.number_of_meals}` : ''}
${clientProfile.macros ? `- Macro Targets: ${typeof clientProfile.macros === 'string' ? clientProfile.macros : JSON.stringify(clientProfile.macros)}` : ''}

CHAT HISTORY (most recent messages are last):
${chatHistoryForPrompt}

CURRENT MEAL PLAN DETAILS:
${mealPlanContext ? `
Your personalized meal plan includes:

DAILY TOTALS:
- Calories: ${mealPlanContext.totals?.calories || 'Not specified'} kcal
- Protein: ${mealPlanContext.totals?.protein || 'Not specified'}g
- Fat: ${mealPlanContext.totals?.fat || 'Not specified'}g
- Carbs: ${mealPlanContext.totals?.carbs || 'Not specified'}g

MEALS:
${mealPlanContext.meals?.map((meal, index) => `
${index + 1}. ${meal.meal}:
   - Main Option: ${meal.main?.meal_title || meal.main?.name || 'Not specified'}
     Calories: ${meal.main?.nutrition?.calories || 'Not specified'} kcal
     Protein: ${meal.main?.nutrition?.protein || 'Not specified'}g
     Fat: ${meal.main?.nutrition?.fat || 'Not specified'}g
     Carbs: ${meal.main?.nutrition?.carbs || 'Not specified'}g
     Ingredients: ${meal.main?.ingredients?.map(ing => `${ing.item} (${ing.household_measure})`).join(', ') || 'Not specified'}
   
   - Alternative Option: ${meal.alternative?.meal_title || meal.alternative?.name || 'Not specified'}
     Calories: ${meal.alternative?.nutrition?.calories || 'Not specified'} kcal
     Protein: ${meal.alternative?.nutrition?.protein || 'Not specified'}g
     Fat: ${meal.alternative?.nutrition?.fat || 'Not specified'}g
     Carbs: ${meal.alternative?.nutrition?.carbs || 'Not specified'}g
     Ingredients: ${meal.alternative?.ingredients?.map(ing => `${ing.item} (${ing.household_measure})`).join(', ') || 'Not specified'}
`).join('\n') || 'No meals specified'}

${mealPlanContext.note ? `NOTES: ${mealPlanContext.note}` : ''}

RECOMMENDATIONS: ${mealPlanContext.recommendations ? JSON.stringify(mealPlanContext.recommendations, null, 2) : 'None specified'}

You can ask me specific questions about any meal, ingredient, nutrition values, or request modifications to your meal plan.
` : 'No meal plan available. I can help you create a personalized meal plan based on your preferences and goals.'}

---
Your task is to respond to the user's message below, taking into account their specific dietary needs, health goals, allergies, limitations, nutrition targets, and their current meal plan. You can provide detailed information about their meals, suggest modifications, explain nutrition values, and answer any questions about their personalized meal plan.
`;

      if (base64Image) {
        aiPrompt = `${instruction}The user has sent an image and a message. Analyze them and provide a helpful response.\nUSER MESSAGE: "${message}"`;
      } else {
        aiPrompt = `${instruction}The user has sent a message. Provide a helpful response.\nUSER MESSAGE: "${message}"`;
      }

      // Default fallback response in case AI fails
      let aiResponse = `Hi ${client.full_name.split(' ')[0]}! Thank you for your message${userMessage.image_url ? ' and the food image' : ''}. \n\n`;
      
      // Include personalized information from client profile
      if (clientProfile.daily_total_calories || clientProfile.macros || clientProfile.goal) {
        aiResponse += `Based on your profile:\n\n`;
        
        if (clientProfile.daily_total_calories) {
          aiResponse += `• Your daily calorie target: ${clientProfile.daily_total_calories} calories\n`;
        }
        if (clientProfile.macros) {
          const macrosText = typeof clientProfile.macros === 'string' ? clientProfile.macros : JSON.stringify(clientProfile.macros);
          aiResponse += `• Your macro targets: ${macrosText}\n`;
        }
        if (clientProfile.goal) {
          aiResponse += `• Your health goal: ${clientProfile.goal}\n`;
        }
        if (clientProfile.activity_level) {
          aiResponse += `• Your activity level: ${clientProfile.activity_level}\n`;
        }
        if (clientProfile.number_of_meals) {
          aiResponse += `• Your meal plan: ${clientProfile.number_of_meals} meals per day\n`;
        }
        
        // Add dietary considerations
        if (clientProfile.food_allergies || clientProfile.food_limitations) {
          aiResponse += `\nDietary considerations:\n`;
          if (clientProfile.food_allergies) {
            const allergies = Array.isArray(clientProfile.food_allergies) ? clientProfile.food_allergies.join(', ') : clientProfile.food_allergies;
            aiResponse += `• Allergies: ${allergies}\n`;
          }
          if (clientProfile.food_limitations) {
            const limitations = Array.isArray(clientProfile.food_limitations) ? clientProfile.food_limitations.join(', ') : clientProfile.food_limitations;
            aiResponse += `• Limitations: ${limitations}\n`;
          }
        }
      }
      
      if (mealPlanContext && mealPlanContext.meals && mealPlanContext.meals.length > 0) {
        aiResponse += `\nYour personalized meal plan includes:\n\n`;
        
        // Daily totals
        if (mealPlanContext.totals) {
          aiResponse += `📊 Daily Totals:\n`;
          aiResponse += `• Calories: ${mealPlanContext.totals.calories || 'Not specified'} kcal\n`;
          aiResponse += `• Protein: ${mealPlanContext.totals.protein || 'Not specified'}g\n`;
          aiResponse += `• Fat: ${mealPlanContext.totals.fat || 'Not specified'}g\n`;
          aiResponse += `• Carbs: ${mealPlanContext.totals.carbs || 'Not specified'}g\n\n`;
        }
        
        // Meals overview
        aiResponse += `🍽️ Your Meals:\n`;
        mealPlanContext.meals.forEach((meal, index) => {
          aiResponse += `${index + 1}. ${meal.meal}\n`;
          if (meal.main?.meal_title) {
            aiResponse += `   Main: ${meal.main.meal_title} (${meal.main.nutrition?.calories || 'N/A'} kcal)\n`;
          }
          if (meal.alternative?.meal_title) {
            aiResponse += `   Alternative: ${meal.alternative.meal_title} (${meal.alternative.nutrition?.calories || 'N/A'} kcal)\n`;
          }
        });
        
        aiResponse += `\nYou can ask me specific questions about any meal, ingredient, or nutrition values in your plan!\n`;
      } else if (mealPlanContext) {
        aiResponse += `\nYour current meal plan details:\n`;
        if (mealPlanContext.daily_total_calories) {
          aiResponse += `• Plan calories: ${mealPlanContext.daily_total_calories} calories\n`;
        }
        if (mealPlanContext.macros_target) {
          aiResponse += `• Plan macro targets: ${JSON.stringify(mealPlanContext.macros_target)}\n`;
        }
        if (mealPlanContext.dietary_restrictions) {
          aiResponse += `• Plan dietary restrictions: ${JSON.stringify(mealPlanContext.dietary_restrictions)}\n`;
        }
        if (mealPlanContext.recommendations) {
          aiResponse += `\nPersonalized recommendations:\n${mealPlanContext.recommendations}\n`;
        }
      } else {
        aiResponse += `\nHere are some general nutrition insights tailored for you:\n\n`;
        aiResponse += `1. Focus on balanced meals with protein, healthy fats, and complex carbohydrates\n`;
        aiResponse += `2. Stay well-hydrated with at least 8 glasses of water daily\n`;
        aiResponse += `3. Eat regular meals to maintain stable energy levels\n`;
        if (clientProfile.goal) {
          aiResponse += `4. Keep your health goal in mind: ${clientProfile.goal}\n`;
        }
      }
      
      if (userMessage.image_url) {
        aiResponse += `\n\nRegarding the food in your image:\n`;
        aiResponse += `- This appears to be a meal you've shared for analysis\n`;
        aiResponse += `- Consider how it fits into your daily nutrition goals\n`;
        aiResponse += `- Feel free to ask specific questions about the nutritional content\n`;
      }
      
      aiResponse += `\n\nWould you like more specific advice about your meal plan or nutrition goals?`;

      // Try to get AI response, use fallback if it fails
      try {
        const response = await InvokeLLM({
          prompt: aiPrompt,
          add_context_from_internet: false,
          base64Image: base64Image || undefined
        });
        if (response) {
          aiResponse = response;
        }
      } catch (aiError) {
        console.error('Error getting AI response, using fallback:', aiError);
      }

      // Clean up the response to remove any prepended JSON
      if (aiResponse.trim().startsWith('{')) {
        const lastBracketIndex = aiResponse.lastIndexOf('}');
        if (lastBracketIndex !== -1) {
          const potentialJson = aiResponse.substring(0, lastBracketIndex + 1);
          const remainingText = aiResponse.substring(lastBracketIndex + 1).trim();
          
          try {
            // Only strip the JSON if there is text following it.
            if (remainingText) {
              JSON.parse(potentialJson);
              aiResponse = remainingText;
            }
          } catch (e) {
            // It wasn't valid JSON, so do nothing and keep the original response.
          }
        }
      }

      // Update chat with AI response
      const finalMessages = [...updatedMessages, { role: 'assistant', content: aiResponse }];

      // Update local git add ,e
      setSelectedChat(prev => ({
        ...prev,
        messages: finalMessages
      }));

      // Clear form
      setMessage('');
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error('Error sending message:', error);
      setError(translations.failedToSend);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
  const file = e.target.files[0];
  if (file instanceof File) {
    setImageFile(file);
  } else {
    console.error("Selected file is not a valid File object.");
  }
}
};
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isFetchingData) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="max-w-lg mx-auto mt-8">
        <InfoIcon className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <div>{error}</div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="flex flex-col h-full">
        {/* Client Selection */}
        <Card className="mb-4">
          <CardHeader>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {translations.selectClientToChat}
                </CardTitle>
                <CardDescription>{translations.chooseClientFromList}</CardDescription>
              </div>
              <div className="w-full md:w-auto md:min-w-[300px]">
                <Select value={selectedClientUserCode || ""} onValueChange={handleClientSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder={translations.selectAClient} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClients.map((client) => (
                      <SelectItem key={client.user_code} value={client.user_code}>
                        {client.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Chat Header - only show when client is selected */}
        {client && (
          <Card className="mb-4">
            <CardHeader>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                <div>
                  <CardTitle>{translations.chatWith} {client.full_name}</CardTitle>
                  <CardDescription>{translations.clientCode}: {client.user_code}</CardDescription>
                </div>
                {mealPlanData && (
                  <div className="text-sm text-right">
                    <span className="text-gray-500">{translations.dailyCalories}: </span>
                    <span className="font-medium">{mealPlanData.daily_total_calories || translations.notSet}</span>
                  </div>
                )}
              </div>
            </CardHeader>
          </Card>
        )}
        
        {/* Chat Area - only show when client is selected */}
        {client ? (
          <>
            <Card className="flex-1 flex flex-col mb-4">
              <CardContent className="flex-1 p-4 overflow-hidden">
                <ScrollArea className="h-full pr-4">
                  {selectedChat?.messages?.length > 0 ? (
                    selectedChat.messages.map((msg, index) => (
                      <div
                        key={index}
                        className={`mb-4 flex ${
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`rounded-lg px-4 py-2 max-w-[80%] ${
                            msg.role === 'user'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          {msg.image_url && (
                            <img
                              src={msg.image_url}
                              alt={translations.uploadedFood}
                              className="rounded-lg mb-2 max-w-full"
                            />
                          )}
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-500">
                      <MessageSquare className="h-12 w-12 text-gray-300 mb-4" />
                      <h3 className="text-xl font-medium mb-2">{translations.startConversation}</h3>
                      <p className="max-w-md">
                        {translations.chatWith} {client.full_name} {translations.chatAboutNutrition}
                      </p>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className={`border-green-200 ${imageFile ? 'bg-green-50 text-green-600' : 'hover:bg-green-50'}`}
              >
                <ImageIcon className="h-5 w-5" />
              </Button>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={`${translations.messageClient} ${client.full_name}...`}
                disabled={isLoading}
                className="border-green-200 focus:ring-green-500"
              />
              <Button
                onClick={handleSend}
                disabled={(!message.trim() && !imageFile) || isLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
            {imageFile && (
              <div className="mt-2 text-sm text-green-600">
                {translations.imageSelected}: {imageFile.name}
              </div>
            )}
          </>
        ) : (
          <Card className="flex-1 flex flex-col mb-4">
            <CardContent className="flex-1 p-4 overflow-hidden">
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-500">
                <Users className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-xl font-medium mb-2">{translations.noClientSelected}</h3>
                <p className="max-w-md">
                  {translations.selectClientToStart}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
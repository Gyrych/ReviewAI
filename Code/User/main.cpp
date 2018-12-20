#include <stdint.h>
#include "stm32f4xx.h"
#include "cmsis_os2.h"
#include "Thead.h"



void TaskStart(void *argument);	//初始线程
void InitBsp(void);				//初始化Bsp

int main(void)
{
	osThreadId_t id;
	
	SystemCoreClockUpdate();	//更新系统时钟值
	InitBsp();

	if (osOK != osKernelInitialize())	//初始化RTOS2
	{
		while(1);
    }
 
	CThead tStart(TaskStart, NULL, NULL);
	
	osKernelStart();			//启动RTOS2
	
	return 0;
}


//初始线程
void TaskStart(void *argument)
{
	while(1)
	{
		GPIO_SetBits(GPIOG, GPIO_Pin_6);
		osDelay(100);
		GPIO_ResetBits(GPIOG, GPIO_Pin_6);
		osDelay(100);
	}
}

void InitBsp(void)
{
	GPIO_InitTypeDef GPIOG_InitStructure;
	
	RCC_AHB1PeriphClockCmd(RCC_AHB1Periph_GPIOG, ENABLE);
	GPIOG_InitStructure.GPIO_Pin = GPIO_Pin_6;
	GPIOG_InitStructure.GPIO_Mode = GPIO_Mode_OUT;
	GPIOG_InitStructure.GPIO_Speed = GPIO_Speed_100MHz;
	GPIOG_InitStructure.GPIO_OType = GPIO_OType_OD;
	GPIOG_InitStructure.GPIO_PuPd = GPIO_PuPd_UP;
	GPIO_Init(GPIOG, &GPIOG_InitStructure);
	GPIO_ResetBits(GPIOG, GPIO_Pin_6);
}
